import type { Sale } from './models';

const arabicWeekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** Formats the table cells rendered by the preview and both print paths. */
export function getReceiptPreview(sale: Sale) {
  const date = new Date(sale.created_at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    bakery: 'مخبز أولاد عثمان',
    date: `${date.getDate()} ${arabicMonths[date.getMonth()]} ${date.getFullYear()}`,
    weekday: arabicWeekdays[date.getDay()],
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    product: sale.product_name,
    quantity: String(sale.quantity),
    unitPrice: `${sale.unit_price.toFixed(2)} ج.م`,
    total: `${sale.total.toFixed(2)} ج.م`,
    thanks: 'شكراً لزيارتكم',
  };
}
