import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { profiles, marketplaceListings } from './schema';
import { randomUUID } from 'crypto';

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  const db = drizzle(client);

  const sarahUserId = randomUUID();

  const [profile] = await db
    .insert(profiles)
    .values({
      userId: sarahUserId,
      fullName: 'Sarah Johnson',
      email: 'sarah.johnson@example.com',
      role: 'user',
      creatorStatus: 'approved',
    })
    .returning();

  const [listing] = await db
    .insert(marketplaceListings)
    .values({
      sellerId: sarahUserId,
      title: 'Financial Literacy for Beginners',
      description:
        'Learn essential financial skills including budgeting, saving, and investing basics. Perfect for young adults starting their financial journey.',
      category: 'course',
      type: 'free',
      price: 0,
      imageUrl: '/images/financial-literacy.jpg',
      tags: ['Finance', 'Personal Finance', 'Beginner'],
      rating: 47,
      enrollmentCount: 0,
      reviewCount: 0,
      status: 'active',
      isFeatured: true,
    })
    .returning();

  console.log('Created profile:', profile);
  console.log('Created listing:', listing);

  await client.end();
}

seed().catch(console.error);
