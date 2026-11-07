import type { Sale } from './models';

const arabicWeekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** Formats the same receipt rows drawn by the Windows GDI print path. */
export function getReceiptPreview(sale: Sale) {
  const date = new Date(sale.created_at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    bakery: 'مخبز أولاد عثمان',
    date: `التاريخ: ${date.getDate()} ${arabicMonths[date.getMonth()]} ${date.getFullYear()}`,
    weekday: `اليوم: ${arabicWeekdays[date.getDay()]}`,
    time: `الوقت: ${pad(date.getHours())}:${pad(date.getMinutes())}`,
    transaction: `رقم العملية: ${sale.id}`,
    product: `نوع العيش: ${sale.product_name}`,
    quantity: `الكمية: ${sale.quantity}`,
    unitPrice: `سعر الوحدة: ${sale.unit_price.toFixed(2)} ج.م`,
    total: `الإجمالي: ${sale.total.toFixed(2)} ج.م`,
    thanks: 'شكراً لزيارتكم',
  };
}
