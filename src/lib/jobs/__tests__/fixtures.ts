import type { Company, Job, JobCard } from '@/types/job';

export const card = (over: Partial<JobCard> = {}): JobCard => ({
    _id: 'j1',
    slug: 'senior-pentester-abc123',
    title: 'Senior Pentester',
    company: 'Acme Security',
    companyLogo: null,
    companyRef: { _id: 'c1', name: 'Acme Security', slug: 'acme-security', logo: null, status: 'verified', isVerified: true },
    category: 'pentesting',
    employmentType: 'full-time',
    experienceLevel: 'senior',
    locationType: 'remote',
    location: null,
    salary: { min: 90000, max: 120000, currency: 'USD', period: 'yearly' },
    skills: ['Burp Suite', 'Python'],
    isFeatured: false,
    applicationDeadline: null,
    expiresAt: '2030-01-31T00:00:00.000Z',
    createdAt: '2030-01-01T00:00:00.000Z',
    viewCount: 12,
    description: 'Break things for a living and write it up so the team can fix them.',
    ...over,
});

export const job = (over: Partial<Job> = {}): Job => ({
    ...card(),
    companyWebsite: 'https://acme.example',
    companyDescription: null,
    requirements: ['3+ years of web testing'],
    responsibilities: ['Run tests'],
    benefits: ['Conference budget'],
    applyUrl: 'https://careers.acme.example/apply/1',
    applyEmail: null,
    ...over,
});

export const company = (over: Partial<Company> = {}): Company => ({
    _id: 'c1',
    name: 'Acme Security',
    slug: 'acme-security',
    logo: null,
    website: 'https://acme.example',
    description: 'We test things.',
    industry: 'Security',
    size: '11-50',
    location: 'Berlin',
    socialLinks: null,
    status: 'verified',
    isVerified: true,
    ...over,
});
