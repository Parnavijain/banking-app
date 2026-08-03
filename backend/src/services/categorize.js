// Dead-simple keyword categorizer. Runs on the transfer note.
// In a real bank you'd have merchant category codes (MCC) or an ML model —
// this gives you the same UI without the complexity.

const CATEGORIES = ['food', 'bills', 'rent', 'shopping', 'entertainment', 'transfer', 'other'];

const RULES = [
  { category: 'food',          keywords: ['food', 'grocery', 'groceries', 'restaurant', 'lunch', 'dinner', 'coffee', 'cafe', 'pizza', 'meal'] },
  { category: 'bills',         keywords: ['bill', 'utility', 'electric', 'water', 'gas', 'internet', 'phone', 'insurance'] },
  { category: 'rent',          keywords: ['rent', 'mortgage', 'lease', 'landlord', 'housing'] },
  { category: 'shopping',      keywords: ['amazon', 'shop', 'shopping', 'store', 'clothes', 'apparel', 'target', 'walmart'] },
  { category: 'entertainment', keywords: ['movie', 'netflix', 'spotify', 'game', 'concert', 'ticket', 'gym'] },
];

function categorize(note) {
  if (!note || typeof note !== 'string') return 'transfer';
  const lower = note.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.category;
  }
  return 'other';
}

module.exports = { categorize, CATEGORIES };
