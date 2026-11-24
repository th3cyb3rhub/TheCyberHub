import { z } from 'zod';

/**
 * Runtime checks for what comes back from the jobs API, used where a bad answer would break a page
 * rendered on the server. The API stays the judge: these are lenient about extra keys (they are kept)
 * and strict about the few fields a page cannot render without.
 */

const nullableString = z.string().nullable().optional();

const companyRefSchema = z.looseObject({
    _id: z.string(),
    name: z.string(),
    slug: z.string(),
    logo: nullableString,
});

const salarySchema = z.looseObject({
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    currency: nullableString,
    period: nullableString,
}).nullable().optional();

export const jobCardSchema = z.looseObject({
    _id: z.string(),
    slug: z.string().min(1),
    title: z.string().min(1),
    company: z.string().default(''),
    companyLogo: nullableString,
    companyRef: companyRefSchema.nullable().optional(),
    category: z.string().default('other'),
    employmentType: z.string().default('full-time'),
    experienceLevel: z.string().default('mid'),
    locationType: z.string().default('remote'),
    location: nullableString,
    salary: salarySchema,
    skills: z.array(z.string()).default([]),
    isFeatured: z.boolean().default(false),
    applicationDeadline: nullableString,
    expiresAt: nullableString,
    createdAt: z.string().default(''),
    viewCount: z.number().default(0),
    isActive: z.boolean().optional(),
    description: z.string().default(''),
});

export const jobDetailSchema = jobCardSchema.extend({
    companyWebsite: nullableString,
    companyDescription: nullableString,
    requirements: z.array(z.string()).default([]),
    responsibilities: z.array(z.string()).default([]),
    benefits: z.array(z.string()).default([]),
    applyUrl: nullableString,
    applyEmail: nullableString,
    updatedAt: z.string().optional(),
});

export const companySchema = z.looseObject({
    _id: z.string(),
    name: z.string().min(1),
    slug: z.string().min(1),
    logo: nullableString,
    website: nullableString,
    description: nullableString,
    industry: nullableString,
    size: nullableString,
    location: nullableString,
    status: z.enum(['pending', 'verified', 'rejected']).default('pending'),
});

export const paginationSchema = z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    total: z.number(),
    totalPages: z.number().default(1),
    pages: z.number().default(1),
    hasMore: z.boolean().default(false),
});
