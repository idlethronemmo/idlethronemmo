import OpenAI from 'openai';
import { db } from '../db';
import { gameItems } from '../shared/schema';
import { eq } from 'drizzle-orm';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const targetLanguages = ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'ru', 'tr'];

async function translateItems() {
  const items = await db.select().from(gameItems);
  console.log(`Found ${items.length} items to process`);
  
  let completed = 0;
  let errors = 0;
  let translated = 0;
  
  for (const item of items) {
    try {
      const existingNameTranslations = (item.nameTranslations as Record<string, string>) || {};
      const existingDescTranslations = (item.descriptionTranslations as Record<string, string>) || {};
      const hasAllNameTranslations = targetLanguages.every(lang => existingNameTranslations[lang]);
      const hasAllDescTranslations = !item.description || targetLanguages.every(lang => existingDescTranslations[lang]);
      
      if (hasAllNameTranslations && hasAllDescTranslations) {
        completed++;
        console.log(`[${completed}/${items.length}] Skipped: ${item.name} (already translated)`);
        continue;
      }
      
      const prompt = `Translate the following game item name and description into these languages: ${targetLanguages.join(', ')}.
Return ONLY a JSON object with this exact structure:
{
  "nameTranslations": { "en": "...", "zh": "...", "hi": "...", "es": "...", "fr": "...", "ar": "...", "ru": "...", "tr": "..." },
  "descriptionTranslations": { "en": "...", "zh": "...", "hi": "...", "es": "...", "fr": "...", "ar": "...", "ru": "...", "tr": "..." }
}

Item Name: ${item.name}
Item Description: ${item.description || 'No description'}

Important: Keep game terminology consistent. For fantasy RPG items, use appropriate terms in each language.`;
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
      });
      
      const content = response.choices[0]?.message?.content || '{}';
      const translations = JSON.parse(content);
      
      await db.update(gameItems)
        .set({ 
          nameTranslations: translations.nameTranslations || {},
          descriptionTranslations: translations.descriptionTranslations || {},
          updatedAt: new Date()
        })
        .where(eq(gameItems.id, item.id));
      
      completed++;
      translated++;
      console.log(`[${completed}/${items.length}] Translated: ${item.name}`);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Error translating ${item.name}:`, error);
      errors++;
      completed++;
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Translation complete!`);
  console.log(`Total items: ${items.length}`);
  console.log(`Translated: ${translated}`);
  console.log(`Errors: ${errors}`);
  console.log(`========================================`);
  process.exit(0);
}

translateItems().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
