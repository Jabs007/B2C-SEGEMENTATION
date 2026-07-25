export type SegmentName = 'Champions' | 'Loyal' | 'At Risk' | 'Regulars';

export const SEGMENT_CONFIG: Record<SegmentName, {
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  icon: string;
  description: string;
  strategy: string;
}> = {
  Champions: { 
    color: '#818cf8',
    bgColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: 'rgba(99, 102, 241, 0.3)',
    textColor: 'text-indigo-400',
    icon: '🏆',
    description: 'Your best customers. They bought recently, buy often, and spend the most.',
    strategy: 'Reward them with exclusive offers, early access to new products, and VIP treatment. Ask for reviews and referrals.',
  },
  Loyal: {
    color: '#34d399',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    textColor: 'text-emerald-400',
    icon: '💎',
    description: 'Customers who buy regularly with high spend and strong recency.',
    strategy: 'Offer loyalty programs, upsell premium products, and provide personalized recommendations based on purchase history.',
  },
  'At Risk': {
    color: '#fbbf24',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    textColor: 'text-amber-400',
    icon: '⚠️',
    description: 'Previously active customers who have not purchased recently.',
    strategy: 'Launch targeted win-back campaigns with special discounts. Send personalized emails reminding them of their past purchases.',
  },
  Regulars: {
    color: '#60a5fa',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    textColor: 'text-blue-400',
    icon: '🔄',
    description: 'Customers with moderate engagement who buy occasionally.',
    strategy: 'Nurture with consistent communication, product education, and moderate incentives to increase purchase frequency.',
  },
};

export const SEGMENT_ORDER: SegmentName[] = ['Champions', 'Loyal', 'At Risk', 'Regulars'];
