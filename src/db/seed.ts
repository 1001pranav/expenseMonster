import type { Category } from '@/domain/types';

type SeedCategory = Pick<Category, 'id' | 'name' | 'icon' | 'color' | 'kind'>;

/**
 * Stable ids (not random) so two phones that both seeded categories merge them
 * instead of ending up with "Groceries" twice after syncing.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  { id: 'cat_groceries', name: 'Groceries', icon: 'basket', color: '#2E9E6A', kind: 'expense' },
  { id: 'cat_food', name: 'Food & dining', icon: 'restaurant', color: '#E8774A', kind: 'expense' },
  { id: 'cat_fuel', name: 'Fuel', icon: 'speedometer', color: '#C2410C', kind: 'expense' },
  { id: 'cat_transport', name: 'Transport', icon: 'bus', color: '#0E7490', kind: 'expense' },
  { id: 'cat_shopping', name: 'Shopping', icon: 'bag-handle', color: '#BE185D', kind: 'expense' },
  { id: 'cat_utilities', name: 'Bills & utilities', icon: 'flash', color: '#CA8A04', kind: 'expense' },
  { id: 'cat_rent', name: 'Rent & housing', icon: 'home', color: '#7C3AED', kind: 'expense' },
  { id: 'cat_health', name: 'Health & medical', icon: 'medkit', color: '#DC2626', kind: 'expense' },
  { id: 'cat_education', name: 'Education', icon: 'school', color: '#2563EB', kind: 'expense' },
  { id: 'cat_entertainment', name: 'Entertainment', icon: 'film', color: '#9333EA', kind: 'expense' },
  { id: 'cat_travel', name: 'Travel', icon: 'airplane', color: '#0891B2', kind: 'expense' },
  { id: 'cat_personal', name: 'Personal care', icon: 'sparkles', color: '#DB2777', kind: 'expense' },
  { id: 'cat_help', name: 'Household help', icon: 'people', color: '#65A30D', kind: 'expense' },
  { id: 'cat_kids', name: 'Kids', icon: 'happy', color: '#F59E0B', kind: 'expense' },
  { id: 'cat_gifts', name: 'Gifts & donations', icon: 'gift', color: '#E11D48', kind: 'expense' },
  { id: 'cat_insurance', name: 'Insurance', icon: 'shield-checkmark', color: '#0F766E', kind: 'expense' },
  { id: 'cat_emi', name: 'EMI & loans', icon: 'trending-down', color: '#4338CA', kind: 'expense' },
  { id: 'cat_invest', name: 'Investments', icon: 'stats-chart', color: '#15803D', kind: 'expense' },
  { id: 'cat_fees', name: 'Fees & charges', icon: 'alert-circle', color: '#B45309', kind: 'expense' },
  { id: 'cat_other', name: 'Other', icon: 'ellipsis-horizontal-circle', color: '#64748B', kind: 'expense' },
  { id: 'cat_salary', name: 'Salary', icon: 'briefcase', color: '#16A34A', kind: 'income' },
  { id: 'cat_business', name: 'Business', icon: 'storefront', color: '#059669', kind: 'income' },
  { id: 'cat_rent_in', name: 'Rent received', icon: 'key', color: '#0D9488', kind: 'income' },
  { id: 'cat_interest', name: 'Interest & dividends', icon: 'cash', color: '#0284C7', kind: 'income' },
  { id: 'cat_cashback', name: 'Refunds & cashback', icon: 'refresh-circle', color: '#4F46E5', kind: 'income' },
  { id: 'cat_gift_in', name: 'Gifts received', icon: 'gift', color: '#C026D3', kind: 'income' },
  { id: 'cat_other_in', name: 'Other income', icon: 'add-circle', color: '#475569', kind: 'income' },
];

/** Default category per biller / obligation type, used when "Mark paid" creates a transaction. */
export const CATEGORY_FOR = {
  bill: 'cat_utilities',
  rent: 'cat_rent',
  school: 'cat_education',
  salary: 'cat_help',
  maintenance: 'cat_rent',
  subscription: 'cat_entertainment',
  policy: 'cat_insurance',
  loan: 'cat_emi',
  income: 'cat_salary',
} as const;

export const MEMBER_COLORS = ['#4F46E5', '#DB2777', '#0D9488', '#EA580C', '#7C3AED', '#0284C7', '#65A30D', '#CA8A04'];
export const CARD_COLORS = ['#1E1B4B', '#7C2D12', '#064E3B', '#1E3A8A', '#581C87', '#0F172A', '#831843'];
