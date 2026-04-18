// app/api/audit/route.ts
// Plastic audit — Open Food Facts + Google Gemini AI
// All API calls server-side only

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Input validation schema
const SearchSchema = z.object({
  query: z.string()
    .min(1, 'Query required')
    .max(100, 'Query too long')
    .regex(/^[a-zA-Z0-9\s\-'\.]+$/, 'Invalid characters'),
  country: z.string().max(5).default('au'),
})

interface ProductAudit {
  name: string
  brand: string
  barcode?: string
  isPlastic: boolean
  isGlass?: boolean
  hasPackagingData?: boolean
  packagingDetails: string[]
  ecoScore: string
  ecoScoreGrade: string
  aiSwapSuggestion: string
  sourceUrl?: string
  confidence: 'high' | 'medium' | 'low'
}

async function fetchOpenFoodFacts(query: string, attempts = 3) {
  const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&action=process&json=1&page_size=5&fields=product_name,brands,code,packaging_tags,ecoscore_grade,ecoscore_data,categories_tags,countries_tags`

  let lastError: string = 'Unknown upstream error'
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 7000)
      let res: Response
      try {
        res = await fetch(offUrl, {
          headers: { 'User-Agent': 'ActionNode/1.0 (earthday2026@actionnode.app)' },
          next: { revalidate: 3600 }, // Cache product data for 1 hour
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      if (!res.ok) {
        lastError = `Open Food Facts HTTP ${res.status}`
      } else {
        const data = await res.json()
        if (Array.isArray(data?.products)) return data
        lastError = 'Open Food Facts returned invalid payload shape'
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown fetch error'
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 300))
    }
  }

  throw new Error(lastError)
}

async function getAISwapSuggestion(
  productName: string,
  category: string,
  isPlastic: boolean,
  packagingDetails: string[],
  country: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return isPlastic
    ? 'Try buying in bulk or look for glass/cardboard alternatives locally.'
    : 'Great choice — this product has eco-friendly packaging!'

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const countryName = country === 'au' ? 'Australia' : country.toUpperCase()
    const prompt = isPlastic
      ? `Product: "${productName}" (category: ${category || 'grocery'})
Plastic packaging detected: ${packagingDetails.join(', ') || 'plastic packaging'}
User location: ${countryName}

Suggest ONE specific, locally-available plastic-free or low-plastic alternative.
- Name actual brands or product types if possible
- Mention where to buy (e.g. "available at Woolworths/Coles/IGA")
- Be specific to the product category
- Under 45 words, friendly tone, no asterisks or markdown`
      : `Product: "${productName}" (category: ${category || 'grocery'})
Eco score: good packaging detected.
User location: ${countryName}

Give a brief, positive eco tip related to this product type. Under 35 words, friendly.`

    const result = await model.generateContent(prompt)
    return result.response.text().trim().substring(0, 200)
  } catch {
    return isPlastic
      ? 'Look for glass, cardboard, or bulk-buy alternatives at your local supermarket.'
      : 'Well chosen! Look for the recycling symbol and dispose of packaging correctly.'
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // Validate input
  const parsed = SearchSchema.safeParse({
    query: searchParams.get('q') || '',
    country: searchParams.get('country') || 'au',
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { query, country } = parsed.data

  try {
    // Fetch from Open Food Facts — free, no key needed
    const data = await fetchOpenFoodFacts(query)

    if (!data.products || data.products.length === 0) {
      return NextResponse.json({
        products: [],
        message: 'No products found for this search. Try a broader term (e.g. "cola", "water", "ketchup").'
      })
    }

    // Process and enrich products (limit to 4)
    const products: ProductAudit[] = await Promise.all(
      data.products
        .filter((p: any) => p.product_name)
        .slice(0, 4)
        .map(async (p: any) => {
          const tags: string[] = p.packaging_tags || []
          const categories: string[] = p.categories_tags || []
          
          const plasticKeywords = ['plastic', 'pet', 'hdpe', 'ldpe', 'pp-', 'pvc', 'ps-', 'polystyrene', 'polypropylene', 'polyethylene']
          const isPlastic = tags.some(t => plasticKeywords.some(k => t.includes(k)))
          const isGlass = tags.some(t => t.includes('glass'))
          const hasPackagingData = tags.length > 0

          // Clean up packaging tag names
          const cleanTags = tags.slice(0, 5).map(t => 
            t.replace('en:', '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())
          )

          const grade = (p.ecoscore_grade || 'unknown').toLowerCase()
          const gradeMap: Record<string, string> = {
            a: 'Very good environmental impact',
            b: 'Good environmental impact',
            c: 'Moderate environmental impact',
            d: 'Poor environmental impact',
            e: 'Very poor environmental impact',
            unknown: 'Impact data unavailable',
          }

          const category = categories[0]?.replace('en:', '').replace(/-/g, ' ') || 'grocery item'

          const aiSuggestion = await getAISwapSuggestion(
            p.product_name,
            category,
            hasPackagingData ? isPlastic : false,
            cleanTags,
            country
          )

          return {
            name: p.product_name.substring(0, 80),
            brand: p.brands?.split(',')[0]?.trim() || '',
            barcode: p.code,
            isPlastic: hasPackagingData ? isPlastic : false,
            isGlass,
            packagingDetails: cleanTags,
            hasPackagingData,
            ecoScore: gradeMap[grade] || gradeMap.unknown,
            ecoScoreGrade: grade,
            aiSwapSuggestion: aiSuggestion,
            sourceUrl: p.code ? `https://world.openfoodfacts.org/product/${p.code}` : undefined,
            confidence: hasPackagingData ? 'high' : ('low' as const),
          }
        })
    )

    return NextResponse.json({ products, total: data.count })

  } catch (error) {
    console.error('Audit API error:', error)
    return NextResponse.json(
      {
        error: 'Product search is temporarily unavailable.',
        message: 'We could not reach the product data provider right now. Please retry in a few seconds.',
        transient: true,
      },
      { status: 502 }
    )
  }
}
