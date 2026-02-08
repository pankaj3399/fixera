import { iconMapData } from './icons';
import { Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';

export const iconMap = iconMapData;

export const serviceCategories = [
  {
    id: 1,
    name: 'Interior Services',
    slug: 'interior-services',
    description: 'Transform the inside of your home with our expert interior services.',
    icon: 'Palette',
    subCategories: [
      {
        name: 'Design & Planning',
        services: [
          { id: 'interior-design', name: 'Interior Design', description: 'Conceptualize and plan your perfect space.' },
          { id: '3d-modeling', name: '3D Modeling', description: 'Visualize your project before it begins.' },
        ]
      },
      {
        name: 'Core Installations',
        services: [
          { id: 'plumbing-services', name: 'Plumbing', description: 'Leaky faucets, new installations, and more.' },
          { id: 'electrical-work', name: 'Electrical Work', description: 'Safe and certified electrical services.' },
          { id: 'hvac-services', name: 'HVAC', description: 'Heating, ventilation, and air conditioning.' },
        ]
      },
      {
        name: 'Finishing Touches',
        services: [
            { id: 'painting-services', name: 'Painting', description: 'Professional interior and exterior painting.' },
            { id: 'flooring-tiling', name: 'Flooring & Tiling', description: 'Hardwood, tile, and carpet installation.' },
            { id: 'carpentry', name: 'Carpentry', description: 'Custom shelves, furniture, and trim work.' },
        ]
      }
    ]
  },
  {
    id: 2,
    name: 'Exterior & Structural',
    slug: 'exterior-structural',
    description: 'Enhance your home’s curb appeal and structural integrity.',
    icon: 'Building',
    subCategories: [
        {
            name: 'Building & Construction',
            services: [
                { id: 'home-renovation', name: 'Full Renovation', description: 'Large-scale renovation projects.' },
                { id: 'roofing', name: 'Roofing', description: 'Repairs, replacement, and new installations.' },
                { id: 'masonry-brickwork', name: 'Masonry & Brickwork', description: 'Walls, patios, and structural repairs.' },
            ]
        },
        {
            name: 'Exterior Finishing',
            services: [
                { id: 'window-door-installation', name: 'Windows & Doors', description: 'Installation and replacement.' },
                { id: 'siding-cladding', name: 'Siding & Cladding', description: 'Protect and beautify your home’s exterior.' },
            ]
        }
    ]
  },
    {
    id: 3,
    name: 'Outdoor & Garden',
    slug: 'outdoor-garden',
    description: 'Create and maintain your perfect outdoor oasis.',
    icon: 'Sun',
    subCategories: [
        {
            name: 'Landscaping',
            services: [
                { id: 'garden-landscaping', name: 'Landscaping Design', description: 'Full garden and landscape planning.' },
                { id: 'lawn-care', name: 'Lawn Care', description: 'Mowing, fertilization, and maintenance.' },
            ]
        },
        {
            name: 'Hardscaping',
            services: [
                { id: 'deck-patio-building', name: 'Decks & Patios', description: 'Build your ideal outdoor living space.' },
                { id: 'fence-installation', name: 'Fencing', description: 'Installation and repair of all fence types.' },
            ]
        }
    ]
  }
];


// --- Categories Data ---
export const categories = [
  { id: 'all', name: 'All Services', count: 45 },
  { id: 'interior', name: 'Interior', count: 15 },
  { id: 'exterior', name: 'Exterior', count: 12 },
  { id: 'outdoor', name: 'Outdoor', count: 8 },
  { id: 'maintenance', name: 'Maintenance', count: 10 }
];

// --- Services Data ---
export const services = [
  {
    id: 1,
    slug: 'interior-design',
    category: 'interior',
    icon: 'Home',
    name: 'Interior Design',
    description: 'Transform your living spaces with professional interior designers.',
    professionals: 180,
    avgRating: 4.8,
    startingPrice: 89,
    popular: true,
  },
  {
    id: 2,
    slug: 'home-renovation',
    category: 'interior',
    icon: 'Hammer',
    name: 'Renovation',
    description: 'Complete home renovations and remodeling projects.',
    professionals: 250,
    avgRating: 4.9,
    startingPrice: 150,
    featured: true,
  },
  {
    id: 3,
    slug: 'plumbing-services',
    category: 'interior',
    icon: 'Wrench',
    name: 'Plumbing',
    description: 'Professional plumbing repairs and installations for any issue.',
    professionals: 200,
    avgRating: 4.7,
    startingPrice: 65,
  },
  {
    id: 4,
    slug: 'painting-services',
    category: 'exterior',
    icon: 'PaintBucket',
    name: 'Painting',
    description: 'Interior and exterior painting by skilled professionals.',
    professionals: 150,
    avgRating: 4.8,
    startingPrice: 45,
  },
  {
    id: 5,
    slug: 'electrical-work',
    category: 'maintenance',
    icon: 'Zap',
    name: 'Electrical Work',
    description: 'Safe electrical installations, repairs, and inspections.',
    professionals: 120,
    avgRating: 4.9,
    startingPrice: 75,
    popular: true,
  },
  {
    id: 6,
    slug: 'garden-landscaping',
    category: 'outdoor',
    icon: 'TreePine',
    name: 'Garden & Landscaping',
    description: 'Beautiful garden design and maintenance services.',
    professionals: 90,
    avgRating: 4.6,
    startingPrice: 55,
  }
];

// --- How It Works Data ---
export const howItWorksSteps = [
  {
    step: 1,
    icon: 'Search',
    title: 'Search & Compare',
    description: 'Browse verified professionals, compare prices, read reviews, and find the perfect match for your project.',
    features: ['Verified professionals', 'Real customer reviews', 'Transparent pricing', 'Local availability'],
  },
  {
    step: 2,
    icon: 'Users',
    title: 'Book or Get Quote',
    description: 'Book instantly for standard services or request custom quotes for complex projects.',
    features: ['Instant booking', 'Custom quotes', 'Secure messaging', 'Project planning'],
  },
  {
    step: 3,
    icon: 'CheckCircle',
    title: 'Get Work Done',
    description: 'Professional completes the work, you confirm satisfaction, and secure payment is released.',
    features: ['Quality guaranteed', 'Secure payments', 'Progress tracking', 'Warranty included'],
  },
];

export const keyBenefits = [
    {
      icon: 'Shield',
      title: 'Money Back Guarantee',
      description: 'Not satisfied? Get your money back with our guarantee policy.'
    },
    {
      icon: 'Clock',
      title: 'Fast Response',
      description: 'Get matched with available professionals within minutes.'
    },
    {
      icon: 'Star',
      title: 'Quality Assured',
      description: 'All professionals are verified and highly rated by customers.'
    },
    {
      icon: 'CreditCard',
      title: 'Secure Payments',
      description: 'Your payment is protected until work is completed successfully.'
    }
];

// --- Features Section Data ---

export const mainFeatures = [
  {
    icon: 'Shield',
    title: 'Verified Professionals',
    description: 'Every professional undergoes identity verification, background checks, and certification validation to ensure you work with the best.',
    benefits: ['ID & passport verification', 'Background checks', 'Insurance validation', 'Skill assessments'],
  },
  {
    icon: 'Star',
    title: 'Quality Guaranteed',
    description: 'All work is backed by the Fixera Guarantee, which includes warranty protection and our comprehensive satisfaction promise.',
    benefits: ['Up to 10-year warranty', 'Satisfaction guarantee', 'Quality control checks', '24/7 dispute resolution'],
  },
  {
    icon: 'Clock',
    title: 'Fast & Reliable',
    description: 'Get matched instantly for urgent jobs or receive competitive quotes within hours. Most projects start within 48 hours.',
    benefits: ['Instant booking available', 'Quick quote responses', 'Flexible scheduling', 'Emergency services'],
  },
  {
    icon: 'CreditCard',
    title: 'Secure Payments',
    description: 'Your money is held securely with our escrow system. You only pay when the work is completed to your satisfaction.',
    benefits: ['Escrow protection', 'Multiple payment options', 'Automatic invoicing', 'Refund guarantee'],
  }
];

export const platformStats = [
  { number: '98%', label: 'Customer Satisfaction', icon: 'Star' },
  { number: '2.3M+', label: 'Projects Completed', icon: 'CheckCircle' },
  { number: '24/7', label: 'Customer Support', icon: 'Phone' },
  { number: '8', label: 'Countries & Growing', icon: 'Globe' }
];


export const testimonials = [
  {
    id: 1,
    name: 'Sophie Van Der Berg',
    location: 'Brussels, Belgium',
    service: 'Kitchen Renovation',
    rating: 5,
    text: "Absolutely incredible experience! The renovation team was professional, punctual, and delivered exactly what was promised. My kitchen looks amazing and the whole process was stress-free.",
    projectValue: '€12,500',
  },
  {
    id: 2,
    name: 'Jan Pietersen',
    location: 'Amsterdam, Netherlands',
    service: 'Plumbing Emergency',
    rating: 5,
    text: "Had a major plumbing emergency on a Sunday. Through Fixera, I found a professional who came within 2 hours and fixed everything. The pricing was transparent and the service was exceptional. Highly recommend!",
    projectValue: '€350',
  },
  {
    id: 3,
    name: 'Marie Dubois',
    location: 'Ghent, Belgium',
    service: 'Interior Painting',
    rating: 5,
    text: "The painter I found transformed my entire apartment. Attention to detail was outstanding, and he even helped choose the perfect colors. The booking process was simple and the results exceeded my expectations.",
    projectValue: '€2,800',
  },
];

// --- Professionals Section Data ---
export const professionalBenefits = [
  {
    icon: 'Users',
    title: 'Access Verified Customers',
    description: 'Connect with real customers who have verified payment methods and genuine project needs across Europe.'
  },
  {
    icon: 'CreditCard',
    title: 'Secure & Timely Payments',
    description: 'Our escrow system protects your earnings. Get paid securely and on time after work is completed.'
  },
  {
    icon: 'Calendar',
    title: 'Smart Scheduling Tools',
    description: 'Manage your calendar, team availability, and project timelines all in one integrated system.'
  },
  {
    icon: 'TrendingUp',
    title: 'Grow Your Business',
    description: 'Expand to new markets, build your reputation with reviews, and access tools to scale your operations.'
  }
];

export const successStories = [
  {
    name: 'Thomas Mueller',
    profession: 'Electrician',
    location: 'Berlin, Germany',
    growth: '+150% Income',
    story: 'Fixera doubled my client base in just 6 months. The platform handles all the admin, so I can focus on quality work.',
    avatarInitial: 'TM',
    image: '/images/success-1.jpg' 
  },
  {
    name: 'Elena Rodriguez',
    profession: 'Interior Designer',
    location: 'Barcelona, Spain',
    growth: '+200% Projects',
    story: 'I now work with clients across 3 countries. The variety and scale of projects I get through Fixera is incredible.',
    avatarInitial: 'ER',
    image: '/images/success-2.jpg'
  },
  {
    name: 'Marco Visser',
    profession: 'Renovation Contractor',
    location: 'Rotterdam, Netherlands',
    growth: 'Grew to a team of 10',
    story: 'I started as a solo contractor. Fixera\'s tools made it effortless to manage a growing team and bigger projects.',
    avatarInitial: 'MV',
    image: '/images/success-3.jpg'
  }
];

// --- CTA Section Data ---
export const quickStats = [
  { icon: 'Users', text: '50K+ Happy Customers' },
  { icon: 'Shield', text: 'Money Back Guarantee' },
  { icon: 'Clock', text: '24/7 Customer Support' },
  { icon: 'Star', text: '4.9/5 Average Rating' }
];

// --- Footer Data ---
export const footerSections = [
    {
      title: 'Popular Services',
      links: [
        { name: 'Interior Design', href: '/services/interior-design' },
        { name: 'Plumbing', href: '/services/plumbing-services' },
        { name: 'Electrical Work', href: '/services/electrical-work' },
        { name: 'Painting', href: '/services/painting-services' },
        { name: 'Renovation', href: '/services/home-renovation' },
      ]
    },
    {
      title: 'For Customers',
      links: [
        { name: 'How It Works', href: '#how-it-works' },
        { name: 'Find Professionals', href: '#services' },
        { name: 'Safety & Trust', href: '#features' },
        { name: 'Project Ideas', href: '#' },
      ]
    },
    {
      title: 'For Professionals',
      links: [
        { name: 'Join as Professional', href: '/join' },
        { name: 'Success Stories', href: '#professionals' },
        { name: 'Business Resources', href: '#' },
        { name: 'Professional Support', href: '#' },
      ]
    },
    {
      title: 'Company',
      links: [
        { name: 'About Fixera', href: '#' },
        { name: 'Careers', href: '#' },
        { name: 'Press & Media', href: '#' },
        { name: 'Partner with Us', href: '#' },
      ]
    }
];

export const footerContact = {
    address: 'Brussels, BE & Amsterdam, NL',
    phone: '+32 2 123 4567',
    email: 'support@fixera.com',
};

export const socialLinks = [
    { name: 'Facebook', icon: Facebook, href: '#' },
    { name: 'Twitter', icon: Twitter, href: '#' },
    { name: 'Instagram', icon: Instagram, href: '#' },
    { name: 'Linkedin', icon: Linkedin, href: '#' },
];

export const legalLinks = [
    { name: 'Privacy Policy', href: '#' },
    { name: 'Terms of Service', href: '#' },
    { name: 'Cookie Policy', href: '#' },
    { name: 'GDPR Compliance', href: '#' },
];


export const subNavbarCategories = [
  {
    name: 'Renovation & Construction',
    slug: 'renovation-construction',
    services: [
      { id: 'full-renovation', name: 'Full Home Renovation' },
      { id: 'kitchen-remodeling', name: 'Kitchen Remodeling' },
      { id: 'bathroom-remodeling', name: 'Bathroom Remodeling' },
      { id: 'basement-finishing', name: 'Basement Finishing' },
      { id: 'roofing-services', name: 'Roofing & Gutters' },
      { id: 'masonry-brickwork', name: 'Masonry & Brickwork' },
      { id: 'flooring-installation', name: 'Flooring Installation' },
      { id: 'demolition-services', name: 'Demolition Services' },
    ]
  },
  {
    name: 'Design & Planning',
    slug: 'design-planning',
    services: [
      { id: 'interior-design', name: 'Interior Design' },
      { id: 'architectural-design', name: 'Architectural Design' },
      { id: '3d-modeling', name: '3D Modeling & Rendering' },
      { id: 'landscape-design', name: 'Landscape Design' },
      { id: 'lighting-design', name: 'Lighting Design' },
      { id: 'permit-drawing', name: 'Permit Drawing & Planning' },
      { id: 'structural-engineering', name: 'Structural Engineering' },
      { id: 'space-planning', name: 'Space Planning' },
    ]
  },
  {
    name: 'Plumbing & Electrical',
    slug: 'plumbing-electrical',
    services: [
      { id: 'emergency-plumbing', name: 'Emergency Plumbing' },
      { id: 'pipe-installation', name: 'Pipe Installation & Repair' },
      { id: 'electrical-wiring', name: 'Electrical Wiring & Rewiring' },
      { id: 'fixture-installation', name: 'Fixture & Appliance Installation' },
      { id: 'hvac-services', name: 'HVAC Services' },
      { id: 'boiler-maintenance', name: 'Boiler Maintenance & Repair' },
      { id: 'solar-panel-installation', name: 'Solar Panel Installation' },
      { id: 'charging-station', name: 'EV Charging Station Installation' },
    ]
  },
  {
    name: 'Painting & Finishing',
    slug: 'painting-finishing',
    services: [
      { id: 'interior-painting', name: 'Interior Painting' },
      { id: 'exterior-painting', name: 'Exterior Painting' },
      { id: 'wallpaper-installation', name: 'Wallpaper Installation' },
      { id: 'plastering-drywall', name: 'Plastering & Drywall' },
      { id: 'tiling-services', name: 'Tiling Services' },
      { id: 'finish-carpentry', name: 'Finish Carpentry & Trim' },
      { id: 'cabinet-refinishing', name: 'Cabinet Refinishing' },
      { id: 'deck-staining', name: 'Deck Staining' },
    ]
  },
  {
    name: 'Outdoor & Garden',
    slug: 'outdoor-garden',
    services: [
      { id: 'garden-maintenance', name: 'Garden Maintenance & Lawn Care' },
      { id: 'deck-patio-construction', name: 'Deck & Patio Construction' },
      { id: 'fence-installation', name: 'Fence Installation & Repair' },
      { id: 'driveway-paving', name: 'Driveway Paving & Sealing' },
      { id: 'pool-installation', name: 'Pool Installation & Maintenance' },
      { id: 'tree-surgery', name: 'Tree Surgery & Removal' },
      { id: 'outdoor-lighting', name: 'Outdoor Lighting' },
      { id: 'irrigation-systems', name: 'Irrigation Systems' },
    ]
  },
  {
    name: 'Cleaning & Maintenance',
    slug: 'cleaning-maintenance',
    services: [
      { id: 'deep-house-cleaning', name: 'Deep House Cleaning' },
      { id: 'window-cleaning', name: 'Window Cleaning' },
      { id: 'gutter-cleaning', name: 'Gutter Cleaning' },
      { id: 'pest-control', name: 'Pest Control' },
      { id: 'pressure-washing', name: 'Pressure Washing' },
      { id: 'handyman-services', name: 'General Handyman Services' },
      { id: 'furniture-assembly', name: 'Furniture Assembly' },
      { id: 'appliance-repair', name: 'Appliance Repair' },
    ]
  }
];

export const professionalPageStats = [
  { name: 'Average Project Value', value: '€450', change: '+15%' },
  { name: 'Top Earner (Monthly)', value: '€8,500+', change: '' },
  { name: 'New Jobs Posted Daily', value: '1,200+', change: '' },
  { name: 'Active Professionals', value: '2.5K+', change: '+200 this month' },
];

export const earningsData = [
  { month: 'Jan', earnings: 2100 },
  { month: 'Feb', earnings: 2500 },
  { month: 'Mar', earnings: 3200 },
  { month: 'Apr', earnings: 3100 },
  { month: 'May', earnings: 4200 },
  { month: 'Jun', earnings: 5100 },
  { month: 'Jul', earnings: 5800 },
  { month: 'Aug', earnings: 6500 },
  { month: 'Sep', earnings: 7100 },
];

export const professionalFaqs = [
  {
    question: "How do I get paid?",
    answer: "Payments are secured through our Escrow system. Once a project is marked as complete by the customer, funds are released to your account within 2-3 business days."
  },
  {
    question: "What are the fees for using Fixera?",
    answer: "Fixera charges a competitive commission fee only on completed projects. There are no subscription fees or costs to join. The fee is a percentage of the final project price and is clearly shown when you provide a quote."
  },
  {
    question: "Can I choose which projects I want to work on?",
    answer: "Absolutely. You have full control. You can browse available jobs, respond to quote requests (RFQs), and accept or decline any project offer that comes your way."
  },
  {
    question: "How does Fixera help me manage my business?",
    answer: "Our platform includes tools for scheduling, communication with clients, automatic invoicing, and a dashboard to track your earnings and project history, helping you stay organized and focus on your work."
  }
];


export const companyValues = [
  {
    icon: 'Shield',
    title: 'Trust & Safety',
    description: 'Every professional is verified, and every project is protected by our Fixera Guarantee.'
  },
  {
    icon: 'Star',
    title: 'Commitment to Quality',
    description: 'We are relentless in our pursuit of high-quality craftsmanship and exceptional service.'
  },
  {
    icon: 'Users',
    title: 'Community Focused',
    description: 'We empower local professionals and help build stronger communities, one project at a time.'
  }
];

export const companyTimeline = [
  { year: '2023', event: 'The idea for Fixera was born out of a frustrating home renovation experience.' },
  { year: '2024', event: 'Platform development begins with a small, dedicated team of engineers and designers.' },
  { year: 'Q1 2025', event: 'Fixera officially launches in Belgium and the Netherlands with 500+ verified professionals.' },
  { year: 'Q3 2025', event: 'Reached 10,000 completed projects and expanded to Germany and France.' },
  { year: 'Future', event: 'Our goal is to become the most trusted home services platform across all of Europe.' }
];

export const teamMembers = [
  { name: 'Alex Weber', role: 'Founder & CEO', image: '/images/team-1.jpg' },
  { name: 'Jasmine Kaur', role: 'Head of Operations', image: '/images/team-2.jpg' },
  { name: 'Leo Van Dijk', role: 'Lead Product Designer', image: '/images/team-3.jpg' },
  { name: 'Sofia Rossi', role: 'Head of Professional Relations', image: '/images/team-4.jpg' },
];

export const professionalsForService = [
  {
    id: 'prof-1',
    name: 'Helena Janssen',
    title: 'Top Rated Modern Interior Designer',
    level: 'Top Rated',
    rating: 4.9,
    reviews: 288,
    startingPrice: 250,
    image: '/images/prof-1.jpg',
    avatar: '/images/team-2.jpg',
  },
  {
    id: 'prof-2',
    name: 'Marcus Reid',
    title: 'Minimalist & Scandinavian Space Planner',
    level: 'Level 2',
    rating: 4.8,
    reviews: 152,
    startingPrice: 180,
    image: '/images/prof-2.jpg',
    avatar: '/images/team-1.jpg',
  },
  {
    id: 'prof-3',
    name: 'Chloe Dubois',
    title: 'Bohemian & Eclectic Home Stylist',
    level: 'Level 2',
    rating: 5.0,
    reviews: 94,
    startingPrice: 220,
    image: '/images/prof-3.jpg',
    avatar: '/images/team-3.jpg',
  },
  {
    id: 'prof-4',
    name: 'Liam O\'Connell',
    title: 'Commercial & Office Space Designer',
    level: 'Level 1',
    rating: 4.7,
    reviews: 45,
    startingPrice: 300,
    image: '/images/prof-4.jpg',
    avatar: '/images/team-4.jpg',
  },
    {
    id: 'prof-5',
    name: 'Isabella Rossi',
    title: 'Luxury & High-End Residential Designer',
    level: 'Top Rated',
    rating: 4.9,
    reviews: 310,
    startingPrice: 800,
    image: '/images/prof-5.jpg',
    avatar: '/images/team-3.jpg',
  },
    {
    id: 'prof-6',
    name: 'Noah Schmitt',
    title: 'Sustainable & Eco-Friendly Design Expert',
    level: 'Level 2',
    rating: 4.8,
    reviews: 120,
    startingPrice: 200,
    image: '/images/prof-6.jpg',
    avatar: '/images/team-1.jpg',
  },
];