// Generated seed content for Talent4u. Assembled from reviewed drafts and
// audited for referential integrity, tier/status distributions, and the
// early-access window split before being written. Edit freely — prisma/seed.ts
// upserts on the slugs and keys in this file, so changes here flow to the
// database on the next `npm run db:seed`.

export interface SeedCategory {
  slug: string;
  name: string;
}

export interface SeedSkill {
  slug: string;
  name: string;
  categorySlug: string;
}

export interface SeedRecruiter {
  slug: string;
  companyName: string;
  email: string;
  country: string;
  tier: "UNVERIFIED" | "VERIFIED" | "TRUSTED";
  description: string;
  companyDomain: string | null;
  registrationNo: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
}

export interface SeedFreelancerSkill {
  slug: string;
  yearsExp: number;
}

export interface SeedFreelancer {
  slug: string;
  displayName: string;
  email: string;
  headline: string;
  bio: string;
  hourlyRateUsd: number;
  country: string;
  timezone: string;
  verification: "NONE" | "ID_VERIFIED" | "ID_AND_WORK_VERIFIED";
  isOpenToWork: boolean;
  /** Mirrors an active Pro subscription; drives searchBoost and the FREELANCER_PRO plan row. */
  isPro: boolean;
  skills: SeedFreelancerSkill[];
  githubUrl: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
}

export interface SeedJob {
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  recruiterSlug: string;
  engagementType: "HOURLY" | "FIXED" | "PART_TIME" | "FULL_TIME";
  isRemote: boolean;
  skillSlugs: string[];
  status: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "CLOSED";
  budgetMinUsd: number | null;
  budgetMaxUsd: number | null;
  location: string | null;
  /**
   * Hours before "now" the job was published, so the 6-hour early-access
   * window stays testable by eye on every re-seed. Null for DRAFT and
   * PENDING_REVIEW, which have never been published.
   */
  publishedHoursAgo: number | null;
}

export interface SeedApplication {
  jobSlug: string;
  freelancerSlug: string;
  coverLetter: string;
  status: "SUBMITTED" | "VIEWED" | "SHORTLISTED" | "REJECTED" | "WITHDRAWN";
  proposedRateUsd: number | null;
  createdDaysAgo: number;
}

export interface SeedReview {
  authorSide: "FREELANCER" | "RECRUITER";
  rating: number;
  body: string;
}

export interface SeedEngagement {
  key: string;
  jobSlug: string | null;
  freelancerSlug: string;
  recruiterSlug: string;
  statedRateUsd: number | null;
  durationWeeks: number | null;
  freelancerConfirmed: boolean;
  recruiterConfirmed: boolean;
  /** Only mutually confirmed engagements may carry reviews — the database enforces this. */
  reviews: SeedReview[];
}

export interface SeedData {
  categories: SeedCategory[];
  skills: SeedSkill[];
  recruiters: SeedRecruiter[];
  freelancers: SeedFreelancer[];
  jobs: SeedJob[];
  applications: SeedApplication[];
  engagements: SeedEngagement[];
}

export const seedData: SeedData = {
  categories: [
  {
    "slug": "ai-automation",
    "name": "AI & Automation"
  },
  {
    "slug": "full-stack-web-development",
    "name": "Full-Stack Web Development"
  },
  {
    "slug": "shopify-ecommerce",
    "name": "Shopify & E-commerce"
  }
],

  skills: [
  {
    "slug": "llm-app-development",
    "name": "LLM Application Development",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "rag-pipelines",
    "name": "RAG Pipelines",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "vector-databases",
    "name": "Vector Databases",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "prompt-engineering",
    "name": "Prompt Engineering",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "ai-agents",
    "name": "AI Agent Development",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "langchain-llamaindex",
    "name": "LangChain & LlamaIndex",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "model-context-protocol",
    "name": "Model Context Protocol (MCP)",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "n8n",
    "name": "n8n",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "make-com",
    "name": "Make.com",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "zapier",
    "name": "Zapier",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "llm-fine-tuning",
    "name": "LLM Fine-Tuning",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "computer-vision",
    "name": "Computer Vision",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "voice-ai-speech-to-text",
    "name": "Voice AI & Speech-to-Text",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "ai-chatbots",
    "name": "AI Chatbots & Support Automation",
    "categorySlug": "ai-automation"
  },
  {
    "slug": "react",
    "name": "React",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "nextjs",
    "name": "Next.js",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "typescript",
    "name": "TypeScript",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "nodejs",
    "name": "Node.js",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "python",
    "name": "Python",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "django",
    "name": "Django",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "laravel",
    "name": "Laravel",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "vuejs",
    "name": "Vue.js",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "postgresql",
    "name": "PostgreSQL",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "graphql",
    "name": "GraphQL",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "tailwind-css",
    "name": "Tailwind CSS",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "aws",
    "name": "AWS",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "docker-kubernetes",
    "name": "Docker & Kubernetes",
    "categorySlug": "full-stack-web-development"
  },
  {
    "slug": "shopify-plus",
    "name": "Shopify Plus",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "shopify-liquid",
    "name": "Shopify Liquid & Theme Development",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "shopify-hydrogen",
    "name": "Shopify Hydrogen & Oxygen",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "shopify-app-development",
    "name": "Shopify App Development",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "shopify-flow",
    "name": "Shopify Flow Automation",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "shopify-checkout-extensibility",
    "name": "Shopify Checkout Extensibility",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "headless-commerce",
    "name": "Headless Commerce",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "klaviyo",
    "name": "Klaviyo Email & SMS",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "subscription-commerce",
    "name": "Subscription Commerce",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "woocommerce",
    "name": "WooCommerce",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "bigcommerce",
    "name": "BigCommerce",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "conversion-rate-optimisation",
    "name": "Conversion Rate Optimisation",
    "categorySlug": "shopify-ecommerce"
  },
  {
    "slug": "product-feed-management",
    "name": "Product Feed Management",
    "categorySlug": "shopify-ecommerce"
  }
],

  recruiters: [
  {
    "slug": "braithwood-digital",
    "companyName": "Braithwood Digital Ltd",
    "email": "hiring@braithwood.co.uk",
    "country": "GB",
    "tier": "TRUSTED",
    "description": "Braithwood Digital has been building line of business web software from a converted mill office in Leeds since 2016. Most of the work is unglamorous and long lived: claims portals for insurance brokers, driver scheduling tools for two regional haulage firms, a booking system a chain of physiotherapy clinics has quietly run on for six years. The team is fourteen people in house and roughly the same number again working as contractors at any given time. In the last two years they added an automation practice, mostly document extraction and case triage layered on top of systems the clients already own, because clients kept asking for it and the alternative was watching them buy it badly somewhere else.\n\nThey hire full stack contractors on six to twelve month engagements, usually TypeScript and Next.js on the front with Postgres and Node or Rails behind it. Rates are set once and not haggled over afterwards. Braithwood has worked with contractors in Lahore, Lagos and Krakow long enough that the onboarding is genuinely async: written specs, recorded walkthroughs, one overlapping hour with the UK team on Tuesdays and Thursdays. They rarely hire for a single sprint, so applications from people who only want short bursts of work tend not to go far.",
    "companyDomain": "braithwood.co.uk",
    "registrationNo": "08472913",
    "linkedinUrl": "https://www.linkedin.com/company/braithwood-digital",
    "websiteUrl": "https://braithwood.co.uk"
  },
  {
    "slug": "nordhafen-systeme",
    "companyName": "Nordhafen Systeme GmbH",
    "email": "jobs@nordhafen-systeme.de",
    "country": "DE",
    "tier": "VERIFIED",
    "description": "Nordhafen Systeme writes software for the people who move containers around. Terminal operators, customs brokers and two mid sized freight forwarders use their dashboards to see where a shipment actually is, as opposed to where the paperwork claims it is. The company grew out of a consultancy that did SAP integration work, and a fair amount of the engineering is still about coaxing usable data out of systems installed in 1998 by people who have long since retired.\n\nHiring is for backend and automation work: Python and TypeScript services, message queues, and increasingly LLM based extraction of bills of lading and customs declarations. German is not required and the engineering team works in English, but they do ask for four hours of overlap with Central European Time, because operations staff need someone reachable when a terminal integration breaks at eight in the morning. Contracts start at three months and are usually extended. They pay monthly, in euros, on the last working day, and they are pedantic about that.",
    "companyDomain": "nordhafen-systeme.de",
    "registrationNo": "HRB 148923",
    "linkedinUrl": "https://www.linkedin.com/company/nordhafen-systeme",
    "websiteUrl": "https://www.nordhafen-systeme.de"
  },
  {
    "slug": "sandline-commerce",
    "companyName": "Sandline Commerce LLC",
    "email": "careers@sandlinecommerce.ae",
    "country": "AE",
    "tier": "VERIFIED",
    "description": "Sandline Commerce runs three direct to consumer brands out of Dubai: a home fragrance line, a modest activewear label, and a smaller kitchenware store that started as an experiment and now outsells the other two in Saudi Arabia. Everything sits on Shopify Plus with bilingual storefronts. The internal team is deliberately small, seven people covering buying, content and paid media, with all engineering brought in from outside.\n\nWhat they hire for is Shopify development, and they are specific about it. Liquid and theme work, checkout extensibility, custom apps for the bundling and subscription logic the brands depend on, and Klaviyo flows that handle Arabic right to left layouts properly instead of pretending the problem does not exist. Engagements usually begin as a fixed scope project of six to ten weeks, and roughly half turn into a monthly retainer. Applicants who send a portfolio of five page marketing sites get passed over fast, so the honest advice is to lead with a store you have actually shipped revenue on.",
    "companyDomain": "sandlinecommerce.ae",
    "registrationNo": "CN-4118736",
    "linkedinUrl": "https://www.linkedin.com/company/sandline-commerce",
    "websiteUrl": "https://sandlinecommerce.ae"
  },
  {
    "slug": "sable-creek-systems",
    "companyName": "Sable Creek Systems, Inc.",
    "email": "contract-hiring@sablecreeksystems.com",
    "country": "US",
    "tier": "VERIFIED",
    "description": "Sable Creek Systems builds internal automation for companies nobody outside their industry has heard of: medical billing firms, title insurance agencies, a franchise HVAC operator with forty branches across Colorado and Utah. The work mostly replaces the brittle screen scraping robots these clients bought in 2019 with something that reads a document, escalates to a human when it is unsure, and logs why it made every call. Auditability matters more here than model cleverness, and the sales conversations reflect that.\n\nThey bring on contract engineers for Python services, retrieval pipelines and evaluation harnesses, and they are unusually interested in people who can write a clear failure analysis. Most hires start at twenty hours a week for a month before moving to a full time contract. Four hours of overlap with Mountain Time is the one hard requirement.",
    "companyDomain": "sablecreeksystems.com",
    "registrationNo": "84-3092176",
    "linkedinUrl": "https://www.linkedin.com/company/sable-creek-systems",
    "websiteUrl": "https://www.sablecreeksystems.com"
  },
  {
    "slug": "wildmoor-supply-co",
    "companyName": "Wildmoor Supply Co.",
    "email": "wildmoorsupply@gmail.com",
    "country": "US",
    "tier": "UNVERIFIED",
    "description": "Wildmoor Supply Co. is two people, a sewing room behind a house in Bend, Oregon, and a waxed canvas supplier down in Portland. They make dog packs, tool rolls and one duffel that took four prototypes to get right. Orders run somewhere between fifteen and sixty a week depending on the season, and the whole thing still runs alongside one full time job.\n\nThe store is on Shopify with a bought theme the founders have edited badly over three years, which is exactly what they want help with. Product page layout, a size and fit guide that does not look pasted in, and getting the checkout to stop dropping the engraving option. The budget is small and stated in the post rather than hidden. They have never hired a developer before and will tell you so in the first message.",
    "companyDomain": null,
    "registrationNo": null,
    "linkedinUrl": null,
    "websiteUrl": "https://wildmoorsupply.com"
  },
  {
    "slug": "nasma-automation",
    "companyName": "Nasma Automation",
    "email": "nasma.automation@outlook.com",
    "country": "AE",
    "tier": "UNVERIFIED",
    "description": "Nasma Automation is one person and a hot desk in Al Quoz. Faisal spent nine years as an operations manager at a freight forwarder in Sharjah, spent most of it rebuilding the same three spreadsheets, and left in March to sell the fix to other people. Current clients are a customs clearance office, two dental clinics and a school supplies distributor, all small enough that one well built workflow saves somebody a full day a week.\n\nThe work is mostly n8n and Make wired into Airtable and WhatsApp Business, with the occasional small Python script when the no code tools run out of road. He is looking for a part time collaborator to take the build work while he handles clients, ideally someone who has shipped these integrations before and can explain them to a non technical owner without jargon. There is no company page yet and no team. This is the first time he has hired anyone.",
    "companyDomain": null,
    "registrationNo": null,
    "linkedinUrl": null,
    "websiteUrl": null
  }
],

  freelancers: [
  {
    "slug": "marek-wisniewski",
    "displayName": "Marek Wiśniewski",
    "email": "marek.wisniewski@protonmail.com",
    "headline": "Next.js and Postgres engineer rebuilding slow B2B dashboards for European SaaS teams",
    "bio": "I take internal tools and customer dashboards that have grown into something nobody wants to touch, and I make them fast and boring again. Most of my work sits in Next.js App Router, TypeScript and Postgres, with a heavy bias towards fixing the data layer before touching a single component. Nine years in, I have learned that the majority of \"slow React app\" complaints are actually four unindexed queries and a poorly scoped Prisma include.\n\nMy clients are mid-size SaaS companies in Germany, the Netherlands and the UK, usually with an engineering team of five to fifteen who need an extra pair of hands on a specific painful area rather than a generalist. Last year I worked with a logistics analytics company whose reporting page took 22 seconds to render for their largest account. We moved the aggregation into materialised views, introduced cursor pagination, and split the page into streamed server components. It now renders in under 900ms for the same account, and their support ticket volume on that page dropped to nearly nothing.\n\nI work in three-week blocks with a written plan up front and a short Loom at the end of each week. I do not do open-ended retainers, and I say no to projects where nobody on the client side can answer questions about the database. I am comfortable in English and German for meetings, and I keep roughly European working hours from Kraków.",
    "hourlyRateUsd": 78,
    "country": "PL",
    "timezone": "Europe/Warsaw",
    "verification": "ID_AND_WORK_VERIFIED",
    "isOpenToWork": true,
    "isPro": true,
    "skills": [
      {
        "slug": "nextjs",
        "yearsExp": 6
      },
      {
        "slug": "typescript",
        "yearsExp": 8
      },
      {
        "slug": "postgresql",
        "yearsExp": 9
      },
      {
        "slug": "react",
        "yearsExp": 9
      },
      {
        "slug": "nodejs",
        "yearsExp": 7
      },
      {
        "slug": "aws",
        "yearsExp": 5
      }
    ],
    "githubUrl": "https://github.com/mwisniewski-dev",
    "portfolioUrl": "https://marekwisniewski.pl",
    "linkedinUrl": "https://linkedin.com/in/marek-wisniewski-dev"
  },
  {
    "slug": "chidinma-okonkwo",
    "displayName": "Chidinma Okonkwo",
    "email": "chidinma.okonkwo@gmail.com",
    "headline": "Django and React developer building payment-heavy web apps for African fintech startups",
    "bio": "I build the parts of fintech products that cannot break: ledgers, reconciliation jobs, KYC flows and the admin panels that operations teams live in eight hours a day. Django REST Framework on the backend, React and TypeScript on the front, Postgres underneath. I care a lot about idempotency and audit trails, which is not glamorous but is the reason my clients keep calling me back.\n\nMost of my work has been with startups in Lagos, Nairobi and Accra, plus two UK companies expanding into Nigeria who needed someone who actually understood local payment rails. On one project, a savings app was double-crediting roughly one in every eight hundred transactions during provider timeouts. I rewrote the webhook handling with a proper transaction state machine and an idempotency key on every write, then backfilled and reconciled fourteen months of history. Zero duplicates since, and their finance lead stopped doing manual spreadsheet checks every Monday.\n\nI am direct about scope. If a feature is going to cost more than it earns, I will say so before we start rather than three sprints in.",
    "hourlyRateUsd": 52,
    "country": "NG",
    "timezone": "Africa/Lagos",
    "verification": "ID_VERIFIED",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "django",
        "yearsExp": 7
      },
      {
        "slug": "python",
        "yearsExp": 8
      },
      {
        "slug": "react",
        "yearsExp": 5
      },
      {
        "slug": "postgresql",
        "yearsExp": 7
      },
      {
        "slug": "typescript",
        "yearsExp": 4
      },
      {
        "slug": "docker-kubernetes",
        "yearsExp": 4
      }
    ],
    "githubUrl": "https://github.com/chidinmaok",
    "portfolioUrl": null,
    "linkedinUrl": "https://linkedin.com/in/chidinma-okonkwo"
  },
  {
    "slug": "rizwan-shaikh",
    "displayName": "Rizwan Shaikh",
    "email": "rizwanshaikh.dev@gmail.com",
    "headline": "Laravel and Vue developer for logistics and field-service companies that outgrew their spreadsheets",
    "bio": "I replace the spreadsheet-and-WhatsApp workflow that small operations companies run on with a real system. Usually that means Laravel, Vue, MySQL or Postgres, and a mobile-friendly interface that a driver or technician can use with one hand. I am not chasing the newest framework. I am trying to make sure the dispatcher can see where everyone is without calling them.\n\nThe last two years have been mostly warehouse and last-mile delivery companies in Karachi, Dubai and Sharjah. A freight forwarder hired me to build a job tracking tool after their coordinator quit and took the master spreadsheet knowledge with her. I shipped a first usable version in five weeks: job creation, driver assignment, proof-of-delivery photos, and a daily reconciliation export their accountant actually accepted. They have since added twelve more users and I still maintain it about four days a month.\n\nI prefer fixed-scope phases over hourly guessing games where I can, and I write documentation as I go because I would rather my clients not depend on me forever.",
    "hourlyRateUsd": 31,
    "country": "PK",
    "timezone": "Asia/Karachi",
    "verification": "NONE",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "laravel",
        "yearsExp": 6
      },
      {
        "slug": "vuejs",
        "yearsExp": 5
      },
      {
        "slug": "postgresql",
        "yearsExp": 4
      },
      {
        "slug": "tailwind-css",
        "yearsExp": 4
      }
    ],
    "githubUrl": null,
    "portfolioUrl": "https://rizwanbuilds.com",
    "linkedinUrl": null
  },
  {
    "slug": "nadia-elsherif",
    "displayName": "Nadia El-Sherif",
    "email": "n.elsherif@outlook.com",
    "headline": "GraphQL API architect untangling monolith-to-service migrations for scaling product teams",
    "bio": "My speciality is the awkward middle stage: a company has one large Node monolith, three teams stepping on each other, and a mandate from someone senior to \"go microservices\" that nobody has thought through. I come in, map what actually talks to what, and design a GraphQL layer that lets teams split apart at a sane pace instead of in one catastrophic weekend.\n\nI have done this for a health-tech company in Berlin, an events platform in London, and an education startup here in Cairo. The Berlin engagement ran seven months. We ended with four services behind a federated gateway, a shared schema review process, and deploy frequency up from twice a month to roughly daily. Just as importantly, we did not split the billing domain, because it did not need splitting, and I spent a fair amount of political capital arguing that point.\n\nI work embedded with the client team rather than off in a corner. That means standups, code review on their PRs as well as mine, and pairing with whoever will inherit the work. I usually take one client at a time at thirty hours a week.\n\nCurrently mid-engagement and not taking new work until I finish, but happy to talk about the autumn.",
    "hourlyRateUsd": 85,
    "country": "EG",
    "timezone": "Africa/Cairo",
    "verification": "ID_AND_WORK_VERIFIED",
    "isOpenToWork": false,
    "isPro": true,
    "skills": [
      {
        "slug": "graphql",
        "yearsExp": 7
      },
      {
        "slug": "nodejs",
        "yearsExp": 10
      },
      {
        "slug": "typescript",
        "yearsExp": 8
      },
      {
        "slug": "postgresql",
        "yearsExp": 9
      },
      {
        "slug": "docker-kubernetes",
        "yearsExp": 6
      },
      {
        "slug": "aws",
        "yearsExp": 7
      },
      {
        "slug": "react",
        "yearsExp": 6
      }
    ],
    "githubUrl": "https://github.com/nelsherif",
    "portfolioUrl": "https://nadiaelsherif.dev",
    "linkedinUrl": "https://linkedin.com/in/nadia-elsherif-eng"
  },
  {
    "slug": "john-paul-bautista",
    "displayName": "John Paul Bautista",
    "email": "jp.bautista@gmail.com",
    "headline": "React and Node developer who ships MVPs for non-technical founders in 8 weeks or less",
    "bio": "I am the first developer a lot of founders ever hire. That means I write the code, but I also do the parts they did not know they needed: choosing what to cut, setting up the domain and email, writing the terms page, and explaining why the thing they saw on Product Hunt took a team of nine and eighteen months.\n\nMy stack is deliberately narrow so I can move fast. React, Node, Postgres, Tailwind, deployed on managed hosting. Recently I built a booking and scheduling product for a Manila-based tutoring network, from empty repo to paying customers in seven weeks. Two hundred tutors are on it now. Before that, a marketplace for secondhand baby gear that got to about four thousand listings before the founder sold it.\n\nI am honest about the limits. I am not the person for a heavily regulated product or anything that needs real infrastructure work at scale. I am very good at getting version one in front of real users while the idea is still cheap to change.",
    "hourlyRateUsd": 38,
    "country": "PH",
    "timezone": "Asia/Manila",
    "verification": "ID_VERIFIED",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "react",
        "yearsExp": 6
      },
      {
        "slug": "nodejs",
        "yearsExp": 6
      },
      {
        "slug": "tailwind-css",
        "yearsExp": 5
      },
      {
        "slug": "postgresql",
        "yearsExp": 4
      },
      {
        "slug": "nextjs",
        "yearsExp": 3
      }
    ],
    "githubUrl": "https://github.com/jpbautista",
    "portfolioUrl": "https://jpbautista.build",
    "linkedinUrl": null
  },
  {
    "slug": "aarav-deshmukh",
    "displayName": "Aarav Deshmukh",
    "email": "aarav.deshmukh92@gmail.com",
    "headline": "TypeScript developer wiring AI features into existing web products without rewriting them",
    "bio": "Companies come to me with a working product and a board slide that says \"AI.\" My job is to find the one or two places where a language model genuinely helps, build those, and leave the rest of the codebase alone. In practice that is usually document extraction, a support assistant grounded in the client's own help centre, or search that understands intent.\n\nI am a full-stack TypeScript developer first and an LLM person second, which I think is the right order. I have shipped a RAG-backed answer panel inside a legal research tool used by about six hundred lawyers, and a resume parsing pipeline for a recruitment platform in Pune that cut their manual screening time by roughly two thirds. Both live inside pre-existing Next.js apps, and both have evaluation harnesses so we know when a prompt change makes things worse.\n\nI am fairly opinionated about not shipping chat interfaces where a form would do.",
    "hourlyRateUsd": 45,
    "country": "IN",
    "timezone": "Asia/Kolkata",
    "verification": "NONE",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "typescript",
        "yearsExp": 6
      },
      {
        "slug": "nextjs",
        "yearsExp": 4
      },
      {
        "slug": "nodejs",
        "yearsExp": 6
      },
      {
        "slug": "rag-pipelines",
        "yearsExp": 3
      },
      {
        "slug": "llm-app-development",
        "yearsExp": 3
      },
      {
        "slug": "postgresql",
        "yearsExp": 5
      },
      {
        "slug": "vector-databases",
        "yearsExp": 2
      }
    ],
    "githubUrl": "https://github.com/aaravdsh",
    "portfolioUrl": null,
    "linkedinUrl": "https://linkedin.com/in/aarav-deshmukh-ts"
  },
  {
    "slug": "fatima-siddiqui",
    "displayName": "Fatima Siddiqui",
    "email": "fatima.siddiqui@hey.com",
    "headline": "Headless Shopify Hydrogen builds for fashion brands migrating off Liquid themes",
    "bio": "I move established Shopify stores from theme customisation they have outgrown onto Hydrogen storefronts, and I do it without losing the SEO they spent years earning. Redirect maps, structured data, image handling and Core Web Vitals are as much a part of my job as writing React.\n\nMy clients are apparel and accessories brands doing somewhere between two and twenty million a year, mostly in the UK and UAE. A London womenswear label brought me in after a failed headless attempt with another agency had left them on a half-finished build. I audited what was salvageable, rebuilt the PDP and collection pages properly, kept their existing checkout extensibility work, and launched in eleven weeks. Mobile LCP went from 4.1s to 1.6s and organic sessions recovered to pre-migration levels within six weeks of launch.\n\nBefore going independent I spent four years at an ecommerce agency in Lahore, which is where I learned that most performance problems on Shopify are apps nobody remembers installing. I always start a project with a full app audit for that reason.\n\nI work UK-overlapping hours, send a written weekly update every Friday, and I will push back if you ask for a headless build when a well-optimised Dawn theme would serve you better.",
    "hourlyRateUsd": 62,
    "country": "PK",
    "timezone": "Asia/Karachi",
    "verification": "ID_AND_WORK_VERIFIED",
    "isOpenToWork": true,
    "isPro": true,
    "skills": [
      {
        "slug": "shopify-hydrogen",
        "yearsExp": 4
      },
      {
        "slug": "headless-commerce",
        "yearsExp": 4
      },
      {
        "slug": "shopify-liquid",
        "yearsExp": 7
      },
      {
        "slug": "react",
        "yearsExp": 6
      },
      {
        "slug": "typescript",
        "yearsExp": 5
      },
      {
        "slug": "shopify-plus",
        "yearsExp": 5
      },
      {
        "slug": "conversion-rate-optimisation",
        "yearsExp": 4
      }
    ],
    "githubUrl": "https://github.com/fsiddiqui-dev",
    "portfolioUrl": "https://fatimasiddiqui.co",
    "linkedinUrl": "https://linkedin.com/in/fatima-siddiqui-shopify"
  },
  {
    "slug": "farhan-qureshi",
    "displayName": "Farhan Qureshi",
    "email": "farhan.qureshi.dev@gmail.com",
    "headline": "LLM agent architect for B2B SaaS teams replacing manual back-office work",
    "bio": "I build production LLM systems for SaaS companies that have outgrown prompt-in-a-loop prototypes. Most of my work is agent orchestration and retrieval infrastructure: deciding what the model should never be trusted to do, wiring the deterministic parts around it, and making the whole thing observable enough that a support engineer can explain any given output six months later. I work almost exclusively with engineering teams of 8 to 40 people, usually in fintech, logistics or legal tech, where a hallucinated answer has an actual cost attached.\n\nThe project I point people to first was a claims triage agent for a UK insurance platform. They were routing about 900 documents a day by hand. We built a RAG layer over their policy corpus with a reranking step and a hard confidence floor, and anything below the floor went to a human queue instead of guessing. Automated routing accuracy settled at 94 percent against a labelled holdout set, and the manual queue dropped to roughly 70 documents a day. The part that took longest was not the model work, it was building the evaluation harness so they could tell whether a prompt change made things better or worse.\n\nI take on two clients at a time, maximum. I want access to real data early, I write evaluation sets before I write chains, and I will tell you when a problem does not need an LLM at all. That last one has cost me work and I am fine with it. Contracts are usually four to twelve weeks, and I hand over documentation written for the engineer who inherits the system, not for a demo.",
    "hourlyRateUsd": 92,
    "country": "PK",
    "timezone": "Asia/Karachi",
    "verification": "ID_AND_WORK_VERIFIED",
    "isOpenToWork": true,
    "isPro": true,
    "skills": [
      {
        "slug": "ai-agents",
        "yearsExp": 4
      },
      {
        "slug": "rag-pipelines",
        "yearsExp": 4
      },
      {
        "slug": "llm-app-development",
        "yearsExp": 5
      },
      {
        "slug": "vector-databases",
        "yearsExp": 4
      },
      {
        "slug": "python",
        "yearsExp": 11
      },
      {
        "slug": "aws",
        "yearsExp": 8
      },
      {
        "slug": "model-context-protocol",
        "yearsExp": 2
      }
    ],
    "githubUrl": "https://github.com/fqureshi-ml",
    "portfolioUrl": "https://farhanqureshi.dev",
    "linkedinUrl": "https://linkedin.com/in/farhanqureshi-ml"
  },
  {
    "slug": "chidinma-okafor",
    "displayName": "Chidinma Okafor",
    "email": "chidinma.okafor@protonmail.com",
    "headline": "n8n and Make automations for African fintech and lending startups",
    "bio": "I connect the systems that startups bolt together in their first two years and never get around to cleaning up. Typically that means a CRM, a KYC provider, a payments API, a spreadsheet somebody in ops guards jealously, and three Slack channels where approvals actually happen. I rebuild that into n8n workflows with proper error handling and retries, so nobody finds out about a failed webhook because a customer complained.\n\nLast year I worked with a Lagos lending startup whose loan officers were copying applicant details between a Google Form, a credit bureau portal and their internal dashboard. I built a pipeline that pulled the form submission, called the bureau API, scored against their rules, and either auto-approved under a threshold or created a review card with everything attached. Average time from application to decision went from about four hours to under nine minutes, and they stopped losing applications entirely.\n\nI am comfortable saying when a workflow tool is the wrong answer and you need actual code. I document every workflow in plain language so your operations lead can change a threshold without calling me.",
    "hourlyRateUsd": 44,
    "country": "NG",
    "timezone": "Africa/Lagos",
    "verification": "ID_VERIFIED",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "n8n",
        "yearsExp": 4
      },
      {
        "slug": "make-com",
        "yearsExp": 5
      },
      {
        "slug": "zapier",
        "yearsExp": 6
      },
      {
        "slug": "nodejs",
        "yearsExp": 5
      },
      {
        "slug": "postgresql",
        "yearsExp": 4
      }
    ],
    "githubUrl": null,
    "portfolioUrl": "https://chidinma.works",
    "linkedinUrl": "https://linkedin.com/in/chidinma-okafor-automation"
  },
  {
    "slug": "nour-el-sayed",
    "displayName": "Nour El-Sayed",
    "email": "nour.elsayed.ai@gmail.com",
    "headline": "Arabic and English voice AI for clinics and appointment-heavy businesses",
    "bio": "Voice is my whole focus. I build speech-to-text and conversational voice systems that work with Egyptian and Gulf Arabic, which is where most off-the-shelf models fall apart, and I handle the code-switching problem where a caller starts in Arabic and drops three English words into the middle of a sentence.\n\nMy longest engagement was with a chain of dental clinics in Cairo and Alexandria. Their reception staff were spending most of the morning on the phone rescheduling. I built a voice agent that handles booking, cancellation and reminder confirmation, with a hard handoff to a human on anything clinical or on any sign of distress in the call. It now takes roughly 60 percent of inbound calls end to end. I spent a lot of that project on transcription accuracy for names, because getting a patient name wrong is worse than failing to book.\n\nI do not oversell this technology. Voice agents break in ways text agents do not, and I would rather scope a narrow flow that works than a broad one that embarrasses you.",
    "hourlyRateUsd": 58,
    "country": "EG",
    "timezone": "Africa/Cairo",
    "verification": "ID_AND_WORK_VERIFIED",
    "isOpenToWork": true,
    "isPro": true,
    "skills": [
      {
        "slug": "voice-ai-speech-to-text",
        "yearsExp": 4
      },
      {
        "slug": "ai-chatbots",
        "yearsExp": 6
      },
      {
        "slug": "prompt-engineering",
        "yearsExp": 4
      },
      {
        "slug": "python",
        "yearsExp": 7
      },
      {
        "slug": "llm-fine-tuning",
        "yearsExp": 3
      },
      {
        "slug": "docker-kubernetes",
        "yearsExp": 4
      }
    ],
    "githubUrl": "https://github.com/nourels",
    "portfolioUrl": null,
    "linkedinUrl": "https://linkedin.com/in/nour-elsayed-voiceai"
  },
  {
    "slug": "aditya-ranganathan",
    "displayName": "Aditya Ranganathan",
    "email": "aditya.rangan@outlook.com",
    "headline": "RAG search over messy internal documentation for engineering orgs",
    "bio": "I spend my time on the unglamorous half of retrieval: chunking strategies for documents that were never meant to be chunked, metadata filtering, hybrid search, and evaluating whether the thing actually retrieves the right passage. Confluence spaces nobody has pruned since 2019, PDF runbooks, Slack exports, Jira tickets with the real answer buried in comment eleven. That is the material I work with.\n\nA German logistics company hired me after their first internal assistant attempt returned confident nonsense often enough that people stopped using it. The problem was not the model. Their chunker was splitting tables in half and their embeddings had no document recency signal, so a deprecated 2021 process page outranked the current one. I rebuilt ingestion with structure-aware parsing, added recency and source-authority weighting, and set up a 300-question evaluation set drawn from real support requests. Retrieval precision at 5 went from 0.41 to 0.83 and internal usage recovered within a month.\n\nMy working style is measurement first. I want a labelled evaluation set before anything ships, and I will push back if there is no way to tell whether the system is improving. I am usually available for 25 to 30 hours a week and I overlap with European mornings comfortably.",
    "hourlyRateUsd": 71,
    "country": "IN",
    "timezone": "Asia/Kolkata",
    "verification": "ID_VERIFIED",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "rag-pipelines",
        "yearsExp": 4
      },
      {
        "slug": "vector-databases",
        "yearsExp": 4
      },
      {
        "slug": "langchain-llamaindex",
        "yearsExp": 3
      },
      {
        "slug": "python",
        "yearsExp": 9
      },
      {
        "slug": "postgresql",
        "yearsExp": 7
      },
      {
        "slug": "aws",
        "yearsExp": 6
      }
    ],
    "githubUrl": "https://github.com/adityarangan",
    "portfolioUrl": "https://rangan.systems",
    "linkedinUrl": null
  },
  {
    "slug": "marta-zielinska",
    "displayName": "Marta Zielińska",
    "email": "marta.zielinska@wp.pl",
    "headline": "AI features inside existing Next.js products, shipped without a rewrite",
    "bio": "Most of my clients already have a working product and want to add something intelligent to it without a six-month detour. I do that work: the streaming chat panel, the semantic search box, the drafting assistant in the editor. I am a TypeScript developer first and an AI developer second, which mostly means I care about what happens when the API times out mid-stream and a user has half a response on screen.\n\nI worked with a Berlin HR software company on a job description assistant built into their posting flow. The interesting constraint was that it had to reflect each customer's tone and compliance rules, so I built a per-tenant prompt configuration layer with versioning and a preview mode, rather than hardcoding one prompt. Their customers now edit their own guidance without a support ticket. Adoption sat around 68 percent of new postings within two months of launch.\n\nI am direct in code review and I write tests for the parts that break silently.",
    "hourlyRateUsd": 76,
    "country": "PL",
    "timezone": "Europe/Warsaw",
    "verification": "ID_AND_WORK_VERIFIED",
    "isOpenToWork": false,
    "isPro": true,
    "skills": [
      {
        "slug": "nextjs",
        "yearsExp": 6
      },
      {
        "slug": "typescript",
        "yearsExp": 8
      },
      {
        "slug": "llm-app-development",
        "yearsExp": 3
      },
      {
        "slug": "react",
        "yearsExp": 8
      },
      {
        "slug": "prompt-engineering",
        "yearsExp": 3
      },
      {
        "slug": "tailwind-css",
        "yearsExp": 5
      }
    ],
    "githubUrl": "https://github.com/mzielinska",
    "portfolioUrl": null,
    "linkedinUrl": "https://linkedin.com/in/marta-zielinska-dev"
  },
  {
    "slug": "jomar-batungbakal",
    "displayName": "Jomar Batungbakal",
    "email": "jomar.batungbakal@gmail.com",
    "headline": "Zapier and chatbot setups for small online stores and coaching businesses",
    "bio": "I am two years into freelancing and my work is mostly small automations that save people an hour or two a day. Order confirmation flows, lead capture into a CRM, abandoned cart follow-up, a simple support chatbot trained on an FAQ document. Nothing exotic, but I finish what I start and I explain things clearly to owners who are not technical.\n\nMy favourite project so far was for a Manila-based skincare shop selling through Shopify and Instagram DMs. Orders from DMs were being written down on paper. I set up a flow that captures the order details into a Google Sheet, sends the customer a confirmation, and creates a draft order in Shopify. The owner told me it cut her evening admin from about ninety minutes to fifteen.\n\nI am upfront that I am early in my career. I ask a lot of questions before I build, I work Manila hours with some evening overlap for US clients, and my rate reflects where I am rather than where I am pretending to be.",
    "hourlyRateUsd": 19,
    "country": "PH",
    "timezone": "Asia/Manila",
    "verification": "NONE",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "zapier",
        "yearsExp": 2
      },
      {
        "slug": "ai-chatbots",
        "yearsExp": 2
      },
      {
        "slug": "make-com",
        "yearsExp": 1
      },
      {
        "slug": "shopify-flow",
        "yearsExp": 1
      },
      {
        "slug": "klaviyo",
        "yearsExp": 2
      }
    ],
    "githubUrl": null,
    "portfolioUrl": null,
    "linkedinUrl": "https://linkedin.com/in/jomar-batungbakal"
  },
  {
    "slug": "ifeoma-adeyemi",
    "displayName": "Ifeoma Adeyemi",
    "email": "ifeoma.adeyemi@zohomail.com",
    "headline": "Computer vision for retail shelf audits and warehouse stock counting",
    "bio": "I build vision systems that count things and check whether they are where they should be. Shelf compliance photos, pallet counts, damage detection on incoming goods. Almost all of my clients are consumer goods distributors or third-party logistics operators who currently pay people to walk around with clipboards.\n\nThe most demanding job I have done was a shelf audit tool for a distributor covering roughly 400 stores in Nigeria and Ghana. Field reps photograph a shelf on a mid-range Android phone, often in poor light, and the model returns share of shelf and out-of-stock flags per SKU. Getting acceptable accuracy on blurry phone photos took far more work on data augmentation and on the labelling guidelines than on model architecture. We landed at roughly 89 percent SKU-level accuracy, which was enough for the client to cut audit visits by a third.\n\nI have started doing more work stitching vision output into downstream automation, so results land in a dashboard and trigger a restock task instead of sitting in a CSV. I usually want a few hundred real images before quoting anything, because sample photos from a client's head office never look like what the field actually sends.",
    "hourlyRateUsd": 54,
    "country": "NG",
    "timezone": "Africa/Lagos",
    "verification": "NONE",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "computer-vision",
        "yearsExp": 6
      },
      {
        "slug": "python",
        "yearsExp": 8
      },
      {
        "slug": "llm-fine-tuning",
        "yearsExp": 2
      },
      {
        "slug": "docker-kubernetes",
        "yearsExp": 4
      },
      {
        "slug": "n8n",
        "yearsExp": 2
      },
      {
        "slug": "postgresql",
        "yearsExp": 5
      }
    ],
    "githubUrl": "https://github.com/ifeoma-adeyemi",
    "portfolioUrl": "https://ifeoma-cv.com",
    "linkedinUrl": "https://linkedin.com/in/ifeoma-adeyemi-cv"
  },
  {
    "slug": "zubair-hashmi",
    "displayName": "Zubair Hashmi",
    "email": "zubair.hashmi@protonmail.com",
    "headline": "Shopify Plus developer for subscription coffee, supplement and pet food brands",
    "bio": "I build and look after Shopify Plus storefronts for brands that sell on a repeat cadence. Coffee roasters, supplement labels, pet food, a couple of skincare companies. Almost all of my work sits in the awkward middle of subscription commerce, where Recharge or Skio was bolted on two years ago and the checkout, the customer portal and the email flows have quietly drifted apart from each other.\n\nThe project I still point people to is a swap and skip rebuild for a Manchester roaster running about 9,000 active subscriptions. Customers could not change grind size or delivery date without opening a support ticket, so they cancelled instead. We moved both actions into the portal, added a pause option that offered a lighter roast before it offered the cancel button, and month three churn went from roughly 21 percent to 14 percent over the following quarter. Support volume dropped enough that they stopped paying for a second seat on their helpdesk.\n\nI work in two week blocks against a staging theme, ship behind a preview link, and send a short screen recording on Fridays rather than writing status reports nobody reads. One thing I say early: I will not do a full redesign and a platform migration inside the same six weeks. That combination fails and it fails expensively, so I would rather lose the job than pretend otherwise.",
    "hourlyRateUsd": 72,
    "country": "PK",
    "timezone": "Asia/Karachi",
    "verification": "ID_AND_WORK_VERIFIED",
    "isOpenToWork": true,
    "isPro": true,
    "skills": [
      {
        "slug": "shopify-plus",
        "yearsExp": 8
      },
      {
        "slug": "shopify-liquid",
        "yearsExp": 9
      },
      {
        "slug": "subscription-commerce",
        "yearsExp": 6
      },
      {
        "slug": "shopify-checkout-extensibility",
        "yearsExp": 3
      },
      {
        "slug": "klaviyo",
        "yearsExp": 5
      },
      {
        "slug": "nodejs",
        "yearsExp": 7
      }
    ],
    "githubUrl": "https://github.com/zubairhashmi",
    "portfolioUrl": "https://zubairhashmi.dev",
    "linkedinUrl": "https://linkedin.com/in/zubairhashmi"
  },
  {
    "slug": "chinedu-okafor",
    "displayName": "Chinedu Okafor",
    "email": "chinedu.okafor@outlook.com",
    "headline": "Theme and Klaviyo work for Nigerian fashion labels selling to the diaspora",
    "bio": "Lagos based, five years on Shopify. I do theme development and lifecycle email for ready to wear and accessories labels that ship from Nigeria to buyers in London, Houston and Toronto. Cross border is where these stores lose money, so most of my work is about making duties, sizing and delivery windows honest on the page instead of a surprise at checkout.\n\nFor a label in Yaba I rebuilt the product page size guide around their actual measured garments rather than a generic chart, and added a landed cost estimate that updates when the customer picks a country. Sizing related refund requests fell by about a third across the next quarter. That number mattered far more to the founder than any traffic figure, because every return was a garment crossing an ocean twice.\n\nI am comfortable being the only developer a small team has. I write plain English notes in the Klaviyo flow descriptions so their marketing person can maintain things after I leave.",
    "hourlyRateUsd": 30,
    "country": "NG",
    "timezone": "Africa/Lagos",
    "verification": "ID_VERIFIED",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "shopify-liquid",
        "yearsExp": 5
      },
      {
        "slug": "klaviyo",
        "yearsExp": 4
      },
      {
        "slug": "conversion-rate-optimisation",
        "yearsExp": 3
      },
      {
        "slug": "tailwind-css",
        "yearsExp": 4
      },
      {
        "slug": "product-feed-management",
        "yearsExp": 2
      }
    ],
    "githubUrl": null,
    "portfolioUrl": "https://okaforstudio.ng",
    "linkedinUrl": "https://linkedin.com/in/chinedu-okafor-commerce"
  },
  {
    "slug": "karolina-nowicka",
    "displayName": "Karolina Nowicka",
    "email": "karolina.nowicka@gmail.com",
    "headline": "Headless Hydrogen storefronts for European furniture and lighting brands in many markets",
    "bio": "I design and build headless Shopify storefronts on Hydrogen and Oxygen, with a strong bias toward brands selling physical goods across a lot of European markets at once. Furniture, lighting, ceramics, anything with heavy imagery, complicated variants and a different VAT story in every country. Before Hydrogen existed I was doing the same thing with Next.js against the Storefront API, so I have opinions about when headless is genuinely the right answer and when a well built Plus theme would have been cheaper and faster.\n\nMy longest engagement was with a Danish lighting company selling into fourteen markets. Their old storefront took over four seconds to render a product image on a mid range Android phone, which is what most of their Southern European traffic was using. We moved to Hydrogen, restructured the media pipeline, and largest contentful paint settled around 1.3 seconds on a throttled connection. Mobile conversion improved 18 percent over the two months after launch, and their content team got a preview environment that no longer required a developer to publish a campaign page.\n\nThe way I run projects is fairly formal for a freelancer. A paid discovery week first, a written architecture decision record for anything that would be painful to reverse, then delivery. I do not disappear at handover either. Every project ends with a documented repo, a runbook, and two sessions with whoever is inheriting it.\n\nI am mostly booked through the end of the year but I will take a short architecture review or a second opinion on a migration plan.",
    "hourlyRateUsd": 90,
    "country": "PL",
    "timezone": "Europe/Warsaw",
    "verification": "ID_AND_WORK_VERIFIED",
    "isOpenToWork": false,
    "isPro": true,
    "skills": [
      {
        "slug": "shopify-hydrogen",
        "yearsExp": 4
      },
      {
        "slug": "headless-commerce",
        "yearsExp": 6
      },
      {
        "slug": "react",
        "yearsExp": 10
      },
      {
        "slug": "nextjs",
        "yearsExp": 7
      },
      {
        "slug": "typescript",
        "yearsExp": 8
      },
      {
        "slug": "graphql",
        "yearsExp": 6
      },
      {
        "slug": "shopify-plus",
        "yearsExp": 5
      }
    ],
    "githubUrl": "https://github.com/knowicka",
    "portfolioUrl": "https://nowicka.dev",
    "linkedinUrl": "https://linkedin.com/in/karolina-nowicka-headless"
  },
  {
    "slug": "kristine-alcantara",
    "displayName": "Kristine Alcantara",
    "email": "kristine.alcantara@gmail.com",
    "headline": "Shopify Flow plus chatbot automation for homeware sellers running several sales channels",
    "bio": "I sit between the store and everything bolted onto it. Shopify Flow rules, n8n workflows, a support chatbot that actually knows your order statuses instead of guessing. My clients are usually small homeware and furniture sellers in the Philippines and Australia who are selling on Shopify, Lazada and a physical showroom at the same time, and are drowning in copy paste between the three.\n\nA Cebu based seller was losing about ten hours a week reconciling stock across channels and chasing their courier for exceptions. I built a flow that catches failed delivery webhooks, opens a task with the right photos attached, and drafts a customer message in Tagalog or English depending on the shipping address. They now handle those cases in an afternoon. I keep things simple on purpose. If a client cannot understand what a workflow does by reading its name, I have built it wrong.",
    "hourlyRateUsd": 32,
    "country": "PH",
    "timezone": "Asia/Manila",
    "verification": "NONE",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "shopify-flow",
        "yearsExp": 3
      },
      {
        "slug": "shopify-liquid",
        "yearsExp": 4
      },
      {
        "slug": "ai-chatbots",
        "yearsExp": 2
      },
      {
        "slug": "n8n",
        "yearsExp": 2
      },
      {
        "slug": "zapier",
        "yearsExp": 3
      },
      {
        "slug": "make-com",
        "yearsExp": 2
      }
    ],
    "githubUrl": null,
    "portfolioUrl": "https://kristinebuilds.ph",
    "linkedinUrl": null
  },
  {
    "slug": "youssef-el-deeb",
    "displayName": "Youssef El-Deeb",
    "email": "youssef.eldeeb@gmail.com",
    "headline": "WooCommerce to Shopify migrations for MENA retailers with large messy catalogues",
    "bio": "Migrations are the whole job for me. Retailers in Egypt, Jordan and the Gulf who outgrew a WooCommerce install that four different agencies have touched, and who are terrified of losing their organic rankings on the way out. I handle catalogue cleanup, redirects, Arabic and English content, and the parts of the old site nobody documented.\n\nMost recently a Cairo appliance retailer with around 11,000 SKUs across three languages. The old URLs were a mix of transliterated Arabic and numeric IDs. I mapped every one of them, preserved the Arabic slugs where they had backlinks, and rebuilt the filtered category pages so they stayed indexable. Organic sessions came back to 96 percent of the previous level within seven weeks, and they were ahead of it by the third month.\n\nI am early in my freelance career and I price accordingly, but I do not rush a migration. I insist on a full data audit before quoting, because the mess is always bigger than the first look suggests.",
    "hourlyRateUsd": 22,
    "country": "EG",
    "timezone": "Africa/Cairo",
    "verification": "NONE",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "woocommerce",
        "yearsExp": 5
      },
      {
        "slug": "shopify-liquid",
        "yearsExp": 3
      },
      {
        "slug": "product-feed-management",
        "yearsExp": 3
      },
      {
        "slug": "laravel",
        "yearsExp": 4
      },
      {
        "slug": "conversion-rate-optimisation",
        "yearsExp": 2
      }
    ],
    "githubUrl": "https://github.com/yeldeeb",
    "portfolioUrl": null,
    "linkedinUrl": "https://linkedin.com/in/youssef-eldeeb"
  },
  {
    "slug": "aniket-deshmukh",
    "displayName": "Aniket Deshmukh",
    "email": "aniket.deshmukh@gmail.com",
    "headline": "B2B checkout, wholesale pricing and custom apps on Shopify Plus for industrial suppliers",
    "bio": "I work almost entirely on the unglamorous side of Shopify. Company specific price lists, net terms, purchase order numbers at checkout, quantity break pricing that has to match what the sales rep quoted on the phone last week. Half of every project is a private Shopify app talking to an ERP that was configured before I finished school.\n\nA fastener supplier in Pune had 400 trade accounts, each with negotiated pricing sitting in a spreadsheet their accounts team maintained by hand. I moved that into company metafields, built a checkout UI extension that captures the PO number and validates it against their credit limit, and wrote a nightly sync back to Tally. Orders that used to take a rep twenty minutes on a call now take the customer four minutes on their own, and the error rate on pricing disputes went to almost nothing.\n\nI came to commerce from general backend work, so I still write tests, still care about database indexes, and still hand over a runbook that explains what breaks at three in the morning and who to call. If your problem is mostly a design refresh, I am the wrong person. If it involves an integration nobody wants to open, I am probably the right one.",
    "hourlyRateUsd": 48,
    "country": "IN",
    "timezone": "Asia/Kolkata",
    "verification": "ID_VERIFIED",
    "isOpenToWork": true,
    "isPro": false,
    "skills": [
      {
        "slug": "shopify-plus",
        "yearsExp": 5
      },
      {
        "slug": "shopify-app-development",
        "yearsExp": 4
      },
      {
        "slug": "shopify-checkout-extensibility",
        "yearsExp": 3
      },
      {
        "slug": "nodejs",
        "yearsExp": 7
      },
      {
        "slug": "postgresql",
        "yearsExp": 6
      },
      {
        "slug": "react",
        "yearsExp": 6
      }
    ],
    "githubUrl": "https://github.com/aniketdeshmukh-dev",
    "portfolioUrl": null,
    "linkedinUrl": null
  }
],

  jobs: [
  {
    "slug": "rag-support-answer-engine-zendesk-braithwood",
    "title": "RAG Engineer to Build a Support Answer Engine over 9 Years of Zendesk Tickets",
    "description": "Braithwood Digital runs the customer support desk for three B2B SaaS products, two of them ours and one white labelled for a client in Bristol. Between them we have nine years of Zendesk history, roughly 412,000 solved tickets, and a macro library nobody has pruned since 2021. Our agents are good. Our search is not.\n\nThe specific problem is this: when a new ticket arrives, somebody on the team has almost certainly answered something close to it before, but Zendesk keyword search will not surface it unless the wording lines up. We want an internal answer engine that takes the incoming ticket text and returns three to five prior resolutions with links, plus a drafted reply the agent can edit before sending. The agent stays in control. We are not auto-replying to customers in this phase and nothing goes in front of an end user.\n\n**What you will build**\n- An ingestion job that pulls ticket threads and help centre articles out of Zendesk, strips signatures and quoted history, and chunks them sensibly (a ticket thread is not a document, and treating it like one is a mistake we have already made once)\n- Embedding and storage in pgvector, since the stack is already Postgres and we would rather not operate a second database\n- A retrieval layer with reranking, plus hard filters on product line and ticket age\n- A small evaluation harness. We will hand label 150 ticket pairs, and we want recall at 5 tracked as you change things, not vibes\n- A thin internal API that our support tooling team wires into the agent console\n\n**What we are looking for**\n- You have shipped retrieval over messy real world text, not just clean PDFs or a docs site\n- Comfortable with LangChain or LlamaIndex without being religious about either. Half our prototype is plain Python and we are fine with that\n- Opinions about chunking and evaluation that you can defend in a call\n- At least four hours of daily overlap with UK working hours\n\nThis starts at roughly 20 hours a week for six weeks, with a good chance of a second phase covering the customer facing version. Rate is 45 to 70 USD per hour depending on experience. When you apply, skip the generic cover letter and write two paragraphs about a retrieval system you actually shipped: what the corpus was, how you chunked it, and how you knew retrieval was working. If you have never measured retrieval quality, this is probably not the right post for you.",
    "categorySlug": "ai-automation",
    "recruiterSlug": "braithwood-digital",
    "engagementType": "HOURLY",
    "isRemote": true,
    "skillSlugs": [
      "rag-pipelines",
      "vector-databases",
      "llm-app-development",
      "langchain-llamaindex",
      "prompt-engineering"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": 45,
    "budgetMaxUsd": 70,
    "location": null,
    "publishedHoursAgo": 3360
  },
  {
    "slug": "logistics-portal-nextjs-rebuild-nordhafen",
    "title": "Senior Next.js Developer, Rebuild of Internal Freight Portal (Hamburg, Onsite Hybrid)",
    "description": "Nordhafen Systeme builds warehouse and freight software for mid sized German logistics operators. Forty one people, one office in Altona, customers who run cross dock sites in Hamburg, Bremerhaven and Rotterdam. Our software is unglamorous and our customers depend on it at four in the morning, which shapes how we work more than any framework choice does.\n\nThe job is a rebuild. Our internal freight portal is a Vue 2 front end bolted onto a PHP monolith that started life in 2016. Vue 2 is out of support, the build takes eleven minutes, and the two people who understood the routing layer have both left. We are moving it to Next.js with TypeScript against a Postgres database we are keeping, because the data model is genuinely fine and the problem was never the database.\n\nYou would own the front end of that rebuild alongside two backend engineers and a product manager who has been at the company for six years and knows every edge case in the shipment status machine. Concretely, you will migrate roughly forty screens, replace a hand rolled permission system with something we can actually reason about, build a proper component library in Tailwind so that our four internal tools stop looking like four different products, and get the whole thing containerised and running on our existing AWS setup. We deploy behind a customer VPN, so there is some infrastructure reality to deal with.\n\nWhat we need: strong React and TypeScript, real Next.js App Router experience including the parts that are annoying, comfort writing SQL rather than hiding from it, and enough Docker knowledge to debug your own build. Experience with logistics, ERP or any domain where a wrong status update costs somebody real money is a genuine plus. German is not required. Our engineering language is English and roughly a third of the team does not speak German, though customer calls happen in German and picking up some over time makes life easier.\n\nThis is a permanent full time role, three days a week in the Hamburg office and two from home. Salary band is 72,000 to 92,000 USD equivalent depending on experience, paid in euros, with the usual German contract, 30 days holiday and a Deutschlandticket. We support relocation and the EU Blue Card process for the right candidate and have done it four times in the last three years, so it is a known path rather than a vague promise.\n\nTo apply, send a short note about a migration you have been part of and what went wrong during it. Everybody has one. We are more interested in that than in a list of frameworks.",
    "categorySlug": "full-stack-web-development",
    "recruiterSlug": "nordhafen-systeme",
    "engagementType": "FULL_TIME",
    "isRemote": false,
    "skillSlugs": [
      "nextjs",
      "react",
      "typescript",
      "postgresql",
      "docker-kubernetes",
      "aws"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": 72000,
    "budgetMaxUsd": 92000,
    "location": "Hamburg, Germany",
    "publishedHoursAgo": 960
  },
  {
    "slug": "checkout-extensibility-migration-sandline-plus",
    "title": "Shopify Plus Developer for checkout.liquid Migration Across 3 Stores",
    "description": "Sandline Commerce runs three Shopify Plus stores out of Dubai selling home fragrance, small kitchen appliances and a growing private label skincare line into the GCC and, since last year, Saudi Arabia. Combined we do a little under 90,000 orders a year. All three stores share a theme lineage but have drifted apart, which is part of why this job exists.\n\nWe are still on checkout.liquid on two of the three stores and we are past the point where waiting is sensible. We need someone who has done a full checkout extensibility migration before, not someone who is going to learn it on our revenue. There is real customisation to preserve, and losing any of it during Ramadan trading would be a bad outcome for everybody.\n\nHere is the honest scope:\n\n- Two Shopify Scripts that need rebuilding as Functions. One is a tiered volume discount on the appliance store, the other applies a free gift over a cart threshold and has three exceptions in it that nobody documented\n- A custom shipping rate app that talks to a local courier API and returns emirate level rates. It works. Please do not rewrite it, just make it behave inside the new checkout\n- Checkout UI extensions for an Arabic and English delivery note field, a VAT invoice request toggle for business buyers, and a small trust badge block after the payment step\n- Post purchase upsell we currently do through a third party app, which we would like to reconsider rather than blindly port\n- Full RTL check on the Arabic storefront, because our current checkout has one alignment bug we have been living with for a year\n\nYou should be able to show us a checkout extensibility migration you have already shipped, ideally on Plus, and talk about what broke. Shopify Functions, checkout UI extensions, Liquid for the rest of the theme, and enough app development experience to read somebody else's app and not panic. We work in a shared Slack channel and expect a short written update at the end of your working day, which is not micromanagement, it is because our timezone overlap is about five hours.\n\nBudget is 6,500 to 9,000 USD as a fixed price for the whole migration, including a two week stabilisation period after each store goes live. We want to be finished and stable before the end of the quarter. Apply with links to stores you migrated, or a description if they are under NDA, and tell us roughly how long you think this takes. Anyone who answers with a number without asking a question first goes to the bottom of the pile.",
    "categorySlug": "shopify-ecommerce",
    "recruiterSlug": "sandline-commerce",
    "engagementType": "FIXED",
    "isRemote": true,
    "skillSlugs": [
      "shopify-plus",
      "shopify-checkout-extensibility",
      "shopify-liquid",
      "shopify-app-development"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": 6500,
    "budgetMaxUsd": 9000,
    "location": null,
    "publishedHoursAgo": 4.5
  },
  {
    "slug": "ops-workflow-automation-n8n-sable-creek",
    "title": "Part-Time n8n Automation Engineer for Revenue Ops Workflows",
    "description": "Sable Creek Systems sells field service scheduling software to plumbing, HVAC and electrical contractors across the United States. We are about sixty people, based in Denver, profitable, and not venture backed, which matters here because it means we buy tools carefully and we do not throw headcount at problems we could automate.\n\nOur revenue operations team has built a considerable pile of Zapier zaps over four years. Some of them are load bearing. A few of them silently stopped firing in March and we found out in June. Nobody owns them, the naming is inconsistent, and there is a Google Sheet in the middle of our lead routing that gives our VP of Sales a genuine physical reaction when it comes up in meetings.\n\nWe want one person, part time and ongoing, to take this seriously. First month is an audit: map what exists, what fires, what has not run since last year, and what should not be an automation at all. After that you would rebuild the important flows in n8n on our self hosted instance, keep the handful of things that genuinely belong in Zapier or Make where they are, and add error handling and alerting so failures are visible instead of discovered a quarter later. The main flows touch HubSpot, Stripe, our own API, Slack and a rather unhappy Airtable base.\n\nThere is an AI piece too, though we would rather you were sceptical about it than enthusiastic. We want inbound demo requests enriched and routed by an agent that reads the form text and company domain, and we want it to hand off to a human whenever it is not confident. If your instinct is to put a model in the middle of everything, we will not get along.\n\nWe have not fixed a rate for this. Tell us what you charge and how you prefer to be engaged, monthly retainer or hourly, and we will work from there. Expect ten to fifteen hours a week with some flexibility in the first month while the audit is happening. You will report to our ops lead, Marisol, who is direct, organised and will answer questions quickly.\n\nApply with a description of one automation system you inherited or cleaned up, including something you deleted rather than rebuilt. We read every application.",
    "categorySlug": "ai-automation",
    "recruiterSlug": "sable-creek-systems",
    "engagementType": "PART_TIME",
    "isRemote": true,
    "skillSlugs": [
      "n8n",
      "make-com",
      "zapier",
      "ai-agents"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": null,
    "budgetMaxUsd": null,
    "location": null,
    "publishedHoursAgo": 5.5
  },
  {
    "slug": "klaviyo-flows-product-feed-cleanup-wildmoor",
    "title": "Klaviyo Flows and Google Product Feed Cleanup for Janitorial Supply Store",
    "description": "Wildmoor Supply Co. has sold janitorial and packaging supplies to schools, churches and small facilities around West Michigan since 1978. My father started it, I run it now, and we moved onto Shopify a bit over two years ago after limping along on an old catalog site for far too long. We carry about 4,100 SKUs, most of them boring, most of them reordered by the same customers every six to eight weeks.\n\nTwo things need fixing and we do not have anyone in house who can do them. First, Klaviyo. We have a welcome email and an abandoned cart that an agency set up in 2023 and then stopped answering our calls. There is no post purchase flow, no reorder reminder, and no winback, which is silly for a business where reorder timing is the whole game. Second, our Google Merchant Center feed has 900 or so products disqualified over GTIN and category problems, and I would like that number to be close to zero.\n\nWork we expect: build and test a proper flow set in Klaviyo including a reorder reminder based on typical replenishment cycle by product type, clean up the product data so the feed passes, set up a Shopify Flow automation to tag wholesale accounts so they stop receiving retail promotions (this has embarrassed us twice), and give us a short plain English list of the conversion problems you notice on the site while you are in there. We are not looking for a redesign right now.\n\nThis one is onsite in Grand Rapids, and I want to be upfront about why, because I know it rules people out. Our product data lives partly in an old inventory system on a machine in the warehouse office that our IT guy will not put on the internet, and pulling clean attributes out of it means sitting next to it. Fifteen to twenty hours a week, flexible days, 28 to 42 USD an hour depending on what you bring. Coffee is decent, the warehouse is cold in February.\n\nEmail me through the platform with anything similar you have done for a distributor or supply business. Screenshots of flow performance are welcome and I will actually look at them.",
    "categorySlug": "shopify-ecommerce",
    "recruiterSlug": "wildmoor-supply-co",
    "engagementType": "HOURLY",
    "isRemote": false,
    "skillSlugs": [
      "klaviyo",
      "product-feed-management",
      "shopify-flow",
      "conversion-rate-optimisation"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": 28,
    "budgetMaxUsd": 42,
    "location": "Grand Rapids, Michigan, United States",
    "publishedHoursAgo": 1032
  },
  {
    "slug": "django-broker-reporting-service-braithwood",
    "title": "Django and Postgres Developer for an Insurance Broker Reporting Service (Fixed Price)",
    "description": "This is a client project. Braithwood Digital is the delivery partner and you would work inside our team, but the end customer is a commercial insurance broker in the north of England with about 200 staff and a compliance function that asks very precise questions.\n\nThey currently produce their monthly regulatory and management reports by exporting from three systems into Excel and having two people reconcile them by hand over four days. It is slow, it is error prone, and last year it produced a number that was wrong in a way that took a fortnight to trace. Our job is to replace that process with a reporting service that pulls from those systems on a schedule, applies the reconciliation rules properly, and produces both a signed off PDF pack and a queryable API the broker's own analysts can use.\n\nThe build is Django and Postgres, with a GraphQL layer over the reporting models because the client's internal team already consumes GraphQL elsewhere and asked for consistency. Heavy lifting is in the data modelling and the rules, not in the interface. There is no front end work in this scope beyond Django admin, which is a relief for some people and a disappointment for others, so it is worth saying clearly.\n\nWhat matters to us: you write migrations you would be happy to run against a production database at nine on a Monday, you are comfortable with window functions and date bucketing in Postgres rather than pulling everything into Python and looping, and you have worked somewhere that reporting numbers had to be defensible. Finance, insurance, healthcare billing or anything audited counts. You will need to sign the client's NDA and pass a standard background check, which they handle and which usually takes about a week.\n\nFixed price of 9,000 to 14,000 USD for the full build, scoped in a kickoff week with our technical lead before we commit to a final figure. Expect roughly eight to ten weeks of work at a normal pace. Remote is fine anywhere with at least three hours of UK overlap, and there is one video call a week with the client that happens at 10am London time and is not moveable.\n\nApply with a short description of the most complicated reporting or reconciliation logic you have implemented and how you tested it. Tests are not optional on this one, so if that answer is thin, say so honestly rather than dressing it up.",
    "categorySlug": "full-stack-web-development",
    "recruiterSlug": "braithwood-digital",
    "engagementType": "FIXED",
    "isRemote": true,
    "skillSlugs": [
      "django",
      "python",
      "postgresql",
      "graphql"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": 9000,
    "budgetMaxUsd": 14000,
    "location": null,
    "publishedHoursAgo": 864
  },
  {
    "slug": "dispatch-call-voice-transcription-nordhafen",
    "title": "Voice AI Engineer for German Dispatch Call Transcription and Extraction",
    "description": "Nordhafen Systeme is scoping a new module for our dispatch product and we are looking for someone who has genuinely shipped speech systems for a language other than clean American English.\n\nOur customers' dispatchers spend a large part of the day on the phone with drivers. Delays, wrong dock numbers, missing paperwork, a customer site that will not accept a delivery after 15:00. Almost none of it gets written down properly. Afterwards the shipment record says nothing, and when a claim comes in three weeks later there is no trace of what was agreed on the call.\n\nWe want to transcribe those calls and pull structured events out of them: shipment reference, delay reason, new estimated time, who agreed to what. Then push that into the dispatch record automatically with a confidence score and a link back to the audio, so a human can check anything doubtful.\n\nThe hard part is not the pipeline, it is the audio. Calls come from truck cabs with engine noise and hands free microphones. Speakers switch between German, Turkish and Polish mid sentence. Shipment references are read out as digit strings and get misheard constantly. Dispatchers use in house shorthand that no general model has ever seen. Anyone who tells us a stock model will handle this out of the box is not somebody we will hire.\n\nWhat we would want to see from a candidate: real experience with speech to text under poor conditions, a sensible approach to domain vocabulary and reference number accuracy, structured extraction that fails loudly rather than guessing, and awareness that we are recording German employees on the phone and that this touches works council and GDPR questions we have to answer before a line of code ships.\n\nWe have not settled the budget or the start date yet. This post is going up so that we can start conversations early. If it looks like your kind of problem, get in touch and our engineering lead will follow up once the internal approval is done.",
    "categorySlug": "ai-automation",
    "recruiterSlug": "nordhafen-systeme",
    "engagementType": "FIXED",
    "isRemote": true,
    "skillSlugs": [
      "voice-ai-speech-to-text",
      "llm-app-development",
      "prompt-engineering",
      "ai-agents"
    ],
    "status": "DRAFT",
    "budgetMinUsd": null,
    "budgetMaxUsd": null,
    "location": null,
    "publishedHoursAgo": null
  },
  {
    "slug": "remote-ai-chat-agent-onboarding-nasma",
    "title": "Remote AI Chatbot Support Agents Needed Urgently, Weekly Payouts, No Experience Required",
    "description": "Nasma Automation is expanding fast and we are onboarding 25 new remote AI chat support specialists this month. Our clients are international brands who need their chatbots managed daily. Earnings are guaranteed at 3,500 to 6,000 USD per month with weekly payouts every Friday. You can work from any country and set your own hours. Positions are limited and are being filled on a first come first served basis, so do not delay your application.\n\nDuties are simple and full training is provided. You will monitor chatbot conversations, adjust prompts, connect flows in Make and Zapier, and escalate issues to our senior team. No prior experience is required as our two week training programme covers everything. The training programme carries a one time fee of 95 USD which covers your certification, your account setup on our secure workspace portal, and your assigned client dashboard. This fee is standard across the industry and is fully recoverable from your first payout.\n\nAll selected agents receive a company issued laptop, noise cancelling headset and licensed software package shipped directly to your address. A refundable security deposit of 250 USD is required before shipping to protect company equipment, and is returned in full after 90 days of continuous service. Applicants who already own suitable equipment may instead pay a reduced processing fee of 40 USD to have their own device verified and enrolled on our network.\n\nBefore final selection every applicant completes an unpaid trial project. You will build a complete customer service chatbot for one of our live client accounts, including flows, escalation logic and a knowledge base of at least 60 answers. Most candidates complete this in around 25 to 30 hours. The trial is unpaid because it is part of the assessment process, however strong submissions are deployed to the client and the agent is prioritised for permanent placement.\n\nTo apply, do not use the message system here as our inbox is overloaded. Send your full name, country, and a photo of your government ID to our hiring officer on the WhatsApp number listed on our company profile and write APPLY AI CHAT in the first message. Registration and deposit payments are accepted by bank transfer, USDT or Western Union. Slots close as soon as the 25 positions are filled.",
    "categorySlug": "ai-automation",
    "recruiterSlug": "nasma-automation",
    "engagementType": "FULL_TIME",
    "isRemote": true,
    "skillSlugs": [
      "ai-chatbots",
      "prompt-engineering",
      "make-com",
      "zapier"
    ],
    "status": "PENDING_REVIEW",
    "budgetMinUsd": 3500,
    "budgetMaxUsd": 6000,
    "location": null,
    "publishedHoursAgo": null
  },
  {
    "slug": "rag-legal-research-assistant-braithwood",
    "title": "RAG Engineer for a Legal Research Assistant (3 Month Contract)",
    "description": "Braithwood Digital is a product studio in Leeds. We build and run software for professional services firms, mostly UK based, and we have been doing it since 2016. This role sits on one client account: a 40 partner commercial law firm whose associates spend an unreasonable amount of time hunting for precedent clauses across roughly 90,000 historic matter documents.\n\nWe shipped a first version of the search assistant in March. It works well enough to keep the client interested and badly enough that people quietly go back to Ctrl+F. Chunking is naive fixed size, everything lives in one index, and there is no evaluation harness at all, so nobody can tell whether a prompt change made things better or worse. That is the mess you would be inheriting, and we would rather be upfront about it than discover your disappointment in week two.\n\n**What the work actually looks like**\n\n- Redesign chunking so clause boundaries and defined terms survive retrieval\n- Introduce hybrid retrieval (BM25 plus dense) with a reranking stage, and prove it beats what we have on a labelled set\n- Build an evaluation harness with a golden question set that the firm's knowledge lawyer helps us write, and run it in CI\n- Make every answer cite the source document and paragraph. No citation means no answer\n- Write the handover documentation, because our in house team takes this over after you leave\n\nWe are looking for someone who has taken a retrieval system past the demo stage at least twice. You should be comfortable arguing about embedding model choice with actual numbers, and equally comfortable saying that a particular problem does not need an LLM. Experience with long, badly formatted legal or financial PDFs is a real advantage. Familiarity with LangChain or LlamaIndex is fine, but we will not be impressed by a chain of forty abstractions.\n\nPracticalities: roughly 25 hours a week for three months, with a decent chance of extension into a second workstream on the same account. You need four hours of overlap with UK business hours, and where you sit outside that does not matter to us. All work happens in the client's GitHub organisation and you will need to sign their standard confidentiality agreement before you see any documents.\n\nTo apply, send a short note about one retrieval system you improved, including what the metric was before and after. If you do not have numbers, tell us how you knew it got better. Skip the generic cover letter. We read every application and we can tell.",
    "categorySlug": "ai-automation",
    "recruiterSlug": "braithwood-digital",
    "engagementType": "HOURLY",
    "isRemote": true,
    "skillSlugs": [
      "rag-pipelines",
      "vector-databases",
      "langchain-llamaindex",
      "prompt-engineering",
      "llm-app-development"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": 45,
    "budgetMaxUsd": 75,
    "location": null,
    "publishedHoursAgo": 2
  },
  {
    "slug": "shopify-plus-checkout-extensibility-sandline",
    "title": "Shopify Plus Checkout Extensibility Migration Across 4 Stores",
    "description": "Sandline Commerce runs four direct to consumer brands out of Dubai, three in home fragrance and one in kitchenware. Between them we do a little over 40,000 orders a year, mostly UAE and Saudi with a growing UK segment. All four stores sit on Shopify Plus under one organisation.\n\nOur checkout is still held together by checkout.liquid customisations that a previous agency wrote in 2021. There is a cash on delivery confirmation step, an Arabic and English toggle, a gift message field that writes to order metafields, and a delivery date picker that our fulfilment team genuinely depends on. All of it has to move to checkout extensibility, and it has to move without breaking the COD flow, because COD is still 38 percent of our orders.\n\nScope of the project:\n\n1. Audit the existing checkout.liquid and Script Editor logic across all four stores and tell us honestly what can simply be dropped\n2. Rebuild the surviving functionality as checkout UI extensions and Shopify Functions\n3. Rewrite the three scripts we cannot lose (a volume discount, a free gift threshold, and a payment method filter that hides COD above a cart value)\n4. Test in a development store with our fulfilment lead before anything touches production\n5. Deploy store by store, smallest brand first, with a rollback plan for each\n\nThis is a fixed price engagement. Quote us for the whole thing after you have looked at the stores. Shortlisted applicants get read access to one of them under NDA so the quote is based on reality rather than optimism. We would rather pay properly once than pay twice.\n\nYou should have completed at least two of these migrations already and be able to name what went wrong in them, because something always does. Arabic and RTL experience in a Shopify context is a strong plus, and if you have worked in COD heavy markets you will understand why we are nervous about this.\n\nSend us the store URLs of checkout migrations you have finished. If those are under NDA, describe the trickiest extension you built and why the standard approach did not work for it.",
    "categorySlug": "shopify-ecommerce",
    "recruiterSlug": "sandline-commerce",
    "engagementType": "FIXED",
    "isRemote": true,
    "skillSlugs": [
      "shopify-plus",
      "shopify-checkout-extensibility",
      "shopify-liquid",
      "shopify-app-development"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": 4500,
    "budgetMaxUsd": 7000,
    "location": null,
    "publishedHoursAgo": 1680
  },
  {
    "slug": "nextjs-logistics-portal-hamburg-nordhafen",
    "title": "Full-Stack Developer (Next.js, TypeScript, PostgreSQL) in Hamburg",
    "description": "Nordhafen Systeme builds software for freight forwarders and port logistics companies. We are 31 people in the Speicherstadt, about half of us engineers, and we have been profitable without outside investment since 2019. Our customers are the kind of companies where a dispatcher still keeps a paper notebook next to three monitors, and our job is to make the software good enough that the notebook becomes optional.\n\nWe are replacing the customer portal that sits in front of our core platform. It is a ten year old Angular application that nobody enjoys touching, and the replacement is being written in Next.js against a Postgres backed API layer. Around 400 companies log into this portal to track shipments, pull customs documents and raise exceptions. It is not a greenfield playground. It has to be at least as reliable as the thing it replaces, on day one.\n\nYour first six months:\n\n- Ship the shipment tracking views, which means live updates from our event stream and tables that stay usable at 2,000 rows\n- Take over the document service (PDF generation and S3 compatible storage on our own infrastructure)\n- Work directly with two customers during rollout, including one site visit to a terminal in Bremerhaven\n- Help settle what stays server rendered and what does not, because that argument is currently unresolved and we would like an engineer with a view\n\nWhat we need from you: solid TypeScript, real App Router experience rather than tutorial experience, and enough SQL that you write your own queries and notice when an index is missing. We run Docker on our own Kubernetes cluster, so container literacy helps. You do not need logistics experience. You do need patience for a domain where an incoterm and a customs code turn out to be the interesting part of the problem.\n\nThis position is onsite in Hamburg, four days a week in the office and one from home. We state that plainly because we have wasted people's time before by being vague about it. We sponsor relocation and run the visa process with a law firm we have used four times already. Two of our current engineers moved here from Kraków and Lahore and are happy to talk to you about how that went. German is not required to be hired, we pay for classes, and most meetings above team level do happen in German.\n\nWe have not listed a salary because it is banded internally by level, and we will tell you the band in the first call rather than negotiating against a number in a job post. It is a permanent contract under German employment law with 30 days of leave.\n\nApply through this platform. A CV plus a link to something you built is enough. If your GitHub is mostly forks, write two paragraphs instead about a system you own at work and what you would change about it now.",
    "categorySlug": "full-stack-web-development",
    "recruiterSlug": "nordhafen-systeme",
    "engagementType": "FULL_TIME",
    "isRemote": false,
    "skillSlugs": [
      "nextjs",
      "typescript",
      "postgresql",
      "react",
      "docker-kubernetes"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": null,
    "budgetMaxUsd": null,
    "location": "Hamburg, Germany",
    "publishedHoursAgo": 5040
  },
  {
    "slug": "n8n-client-onboarding-automation-nasma",
    "title": "n8n Specialist to Rebuild Our Client Onboarding Workflows",
    "description": "Nasma Automation is a small automation consultancy in Dubai. There are four of us. We set up internal workflows for accounting firms, clinics and property managers around the GCC, and lately we are selling more work than we can build.\n\nThe first job is getting our own house in order. Client onboarding currently runs across nine Make scenarios and a Google Sheet that exactly one person understands. We want it rebuilt in n8n on our self hosted instance, with proper error handling and a Slack alert when something fails, instead of us finding out from the client three days later.\n\nAfter that the work turns client facing. Typical jobs are a WhatsApp intake bot that files leads into a CRM, invoice data pulled out of PDFs and pushed into Zoho, and appointment reminders that respect Ramadan hours. None of this is research level work. It is careful plumbing that has to keep running when nobody is watching it.\n\nWe need roughly 15 hours a week to start, with overlap into the Gulf morning. Written English matters here because you will sometimes be in the client channel yourself, answering questions without one of us in the middle. If you have only ever worked in Zapier you can still apply, but tell us how quickly you think you could get comfortable in n8n.\n\nWhen you apply, describe one automation you built that broke in production and what you changed so it stopped breaking. That answer tells us far more than a list of tools.",
    "categorySlug": "ai-automation",
    "recruiterSlug": "nasma-automation",
    "engagementType": "PART_TIME",
    "isRemote": true,
    "skillSlugs": [
      "n8n",
      "make-com",
      "zapier",
      "ai-chatbots"
    ],
    "status": "ACTIVE",
    "budgetMinUsd": 25,
    "budgetMaxUsd": 40,
    "location": null,
    "publishedHoursAgo": 200
  },
  {
    "slug": "django-usage-billing-rebuild-sable-creek",
    "title": "Senior Django Engineer, Usage Based Billing Rebuild (Denver Hybrid)",
    "description": "Sable Creek Systems sells fleet maintenance software to mid market trucking companies in the US and Canada. About 600 customers, all billed monthly, all billed slightly differently, because our sales team spent six years saying yes to custom pricing.\n\nBilling is now the part of the product that scares us. It is a Django monolith with a nightly job that assembles invoices from three sources: seat counts, telematics events ingested per vehicle, and a manual adjustments table that finance edits directly in the Django admin. Last quarter we issued 41 credit memos because of billing errors. That number is the entire reason this role exists.\n\nThe job is to take ownership of billing and make it boring again:\n\n- Model the pricing rules properly instead of leaving them encoded in conditionals spread across four apps\n- Move invoice assembly off the nightly cron and into something idempotent and replayable\n- Build an internal tool so finance stops editing rows in the admin\n- Backfill and reconcile twelve months of history, so we can prove the new system matches the old one where it should and differs where it should\n- Add the test coverage this code has never had\n\nYou would work with one other backend engineer, our controller, and whoever from support is on the billing rota that week. We use Python 3.12, Django 5, Postgres on RDS, Celery, and more raw SQL than is currently fashionable. Deployment is ECS with Terraform, maintained by our platform engineer, so you will not be on call for infrastructure.\n\nWe want someone who has worked on money code before and treats it differently from other code. If you have opinions about idempotency keys, decimal handling, and why you never hard delete an invoice, we will get along. Metering or usage based billing experience at any scale is the single strongest signal for us.\n\nThis is hybrid out of our Denver office, three days a week in person. We cannot consider fully remote candidates for this particular role. We know that narrows the pool, but billing conversations happen at a whiteboard with finance in the room and every other arrangement we tried produced more credit memos.\n\nApply with a short description of a billing or payments system you worked on and one decision in it you would make differently today.",
    "categorySlug": "full-stack-web-development",
    "recruiterSlug": "sable-creek-systems",
    "engagementType": "FULL_TIME",
    "isRemote": false,
    "skillSlugs": [
      "python",
      "django",
      "postgresql",
      "aws"
    ],
    "status": "DRAFT",
    "budgetMinUsd": 150000,
    "budgetMaxUsd": 185000,
    "location": "Denver, Colorado, United States",
    "publishedHoursAgo": null
  },
  {
    "slug": "shopify-theme-klaviyo-refresh-wildmoor",
    "title": "Shopify Theme Refresh and Klaviyo Flow Rebuild for Outdoor Gear Store",
    "description": "Wildmoor Supply Co. sells camping and packrafting gear out of a warehouse in Bend, Oregon. We started on eBay in 2014, moved to Shopify in 2018, and the store has been running a lightly modified Dawn theme ever since. Traffic is fine. The site just looks like what it is, which is a stock theme with eleven years of gear photos dropped into it.\n\nWe want a refresh, not a rebuild. Specifically: a new homepage, a collection page whose filters actually work on mobile, product pages that handle our size and length variants without the current dropdown mess, and a bundle section for our tent plus footprint pairings.\n\nThe second half of the job is Klaviyo. We have a welcome series nobody has touched since 2022, an abandoned cart flow that fires far too late, and no post purchase flow at all. We want those rebuilt and segmented by product category, because somebody buying a 300 dollar sleeping bag is not the same customer as somebody buying carabiners.\n\nBefore we hand the project to anyone, we ask shortlisted freelancers to complete an unpaid trial build so we can see how you work. The trial is a full collection page template plus two Klaviyo flows in our sandbox account. Most people tell us it takes somewhere between twenty and twenty five hours. The trial is unpaid, and we only pay for the project itself once it has been awarded.\n\nOn payment, we settle invoices directly rather than through the platform. Send your PayPal address or your Venmo handle with your application (ours is @wildmoor-supply) and we will arrange the first transfer off site so neither of us has to deal with the paperwork here.\n\nPortfolio links preferred over resumes. Show us stores you have actually shipped, ideally in outdoor, sporting goods or anything else with awkward variant structures.",
    "categorySlug": "shopify-ecommerce",
    "recruiterSlug": "wildmoor-supply-co",
    "engagementType": "FIXED",
    "isRemote": true,
    "skillSlugs": [
      "shopify-liquid",
      "klaviyo",
      "conversion-rate-optimisation"
    ],
    "status": "PENDING_REVIEW",
    "budgetMinUsd": 1200,
    "budgetMaxUsd": 2200,
    "location": null,
    "publishedHoursAgo": null
  },
  {
    "slug": "laravel-vue-reporting-portal-braithwood",
    "title": "Laravel 11 and Vue 3 Developer for Client Reporting Portal Rebuild",
    "description": "This is a second engagement for a client we have supported since 2019, a facilities management company in the Midlands with around 700 engineers on the road. They run a reporting portal that their own customers log into to see completed jobs, SLA performance and monthly spend. It is Laravel 8 with a Vue 2 frontend and it has become slow enough that their largest customer raises it in every quarterly review.\n\nBraithwood Digital is handling the rebuild. We need one contractor working alongside one of our developers for roughly ten weeks.\n\nThe work:\n\n- Upgrade the application to Laravel 11 and migrate the frontend to Vue 3 with the composition API\n- Replace report generation, which currently assembles everything in PHP memory and times out on the two largest accounts. Expect to push aggregation down into Postgres\n- Rebuild the scheduled PDF and CSV exports that go out on the first working day of every month\n- Tidy up the queue setup, which at present is one worker doing absolutely everything\n\nYou will not be designing anything. Our designer has already delivered the screens and they are not up for renegotiation, which some contractors find frustrating and others find restful. Worth knowing which one you are before applying.\n\nWe are after strong Laravel fundamentals, genuine Vue 3 experience rather than Vue 2 with hopes, and enough comfort with Postgres to read a query plan without panicking. Tailwind is used throughout. The client's environment is Dockerised and deployed to their own servers, so you should be able to work in a setup that is neither Forge nor Vapor.\n\nHours are flexible around two fixed calls a week, Tuesday and Thursday mornings UK time. Invoicing is monthly against a timesheet. If you are interested, link a Laravel codebase you can talk about in detail, because we will ask about it.",
    "categorySlug": "full-stack-web-development",
    "recruiterSlug": "braithwood-digital",
    "engagementType": "HOURLY",
    "isRemote": true,
    "skillSlugs": [
      "laravel",
      "vuejs",
      "postgresql",
      "tailwind-css",
      "docker-kubernetes"
    ],
    "status": "CLOSED",
    "budgetMinUsd": 35,
    "budgetMaxUsd": 55,
    "location": null,
    "publishedHoursAgo": 2688
  }
],

  applications: [
  {
    "jobSlug": "rag-support-answer-engine-zendesk-braithwood",
    "freelancerSlug": "aditya-ranganathan",
    "coverLetter": "Nine years of Zendesk data is the part of this job that decides whether it works, not the model choice. In my experience roughly half of an archive that size is noise: auto-replies, duplicate threads, macros agents pasted in, and resolutions that live in an internal note rather than the public reply. Before I index anything I would pull a sample of about 2,000 tickets spread across the full date range and classify which ones actually contain a usable answer, then build the ingestion filter from that.\n\nI did something close to this last year for an infrastructure company in Bengaluru. 140k tickets in Intercom plus a Confluence space nobody had touched since 2019. We ended up indexing about a third of the original volume and answer accuracy went from unusable to 78 percent on a 300 question eval that the support leads wrote themselves. That eval mattered more than any reranker I tried.\n\nI would suggest starting with a two week paid discovery: ingestion plan, eval set, and a working prototype over one product area, so you see real numbers before committing to the full build. I have about 25 hours a week free and my day overlaps well with UK mornings.",
    "status": "SHORTLISTED",
    "proposedRateUsd": 75,
    "createdDaysAgo": 133
  },
  {
    "jobSlug": "rag-support-answer-engine-zendesk-braithwood",
    "freelancerSlug": "farhan-qureshi",
    "coverLetter": "Support answer engines usually fail for boring reasons. Retrieval is fine, the answer still gets bounced back to the queue, because nobody defined what happens when the model is not confident and nobody told the agents what the tool is actually for. I build these as agent systems with a refusal path and a clean handoff, not as a search box with a language model bolted on top.\n\nMy last two builds were back-office replacements for B2B SaaS teams. One deflects 31 percent of tier one tickets for a UK payroll product. The other never talks to customers at all, it drafts a response the agent edits, which is what that client's legal team insisted on. The Zendesk API is familiar territory for me, including side conversations and the fact that ticket fields drift badly over nine years.\n\nThe thing I would want settled early is whether you are aiming at customer facing deflection or agent assist, because the guardrail budget is completely different. My rate is 92 an hour and I can pick this up from the first week of next month.",
    "status": "VIEWED",
    "proposedRateUsd": 92,
    "createdDaysAgo": 9
  },
  {
    "jobSlug": "rag-support-answer-engine-zendesk-braithwood",
    "freelancerSlug": "jomar-batungbakal",
    "coverLetter": "Good day. I saw your post for the ticket answer engine and I would like to be considered. I have built many chatbots for online stores using Zapier, Make and the OpenAI API, and for one client I connected Zendesk to Slack so a new ticket posts into the right channel with the customer history attached.\n\nI have not worked with nine years of data before. My biggest knowledge base project was around 4,000 FAQ entries and product pages in Pinecone. But I learn quickly, I am available full time, and my rate is friendly. If you need someone to do the cleanup and preparation work under a senior engineer, I would be very glad to take that part.",
    "status": "REJECTED",
    "proposedRateUsd": 20,
    "createdDaysAgo": 5
  },
  {
    "jobSlug": "rag-legal-research-assistant-braithwood",
    "freelancerSlug": "aditya-ranganathan",
    "coverLetter": "For a legal research assistant the hard requirement is that every sentence in the answer traces back to a specific paragraph of a specific document, with a date attached. That changes the design quite a bit from a support bot. Chunking follows the structure of the document, section and clause and subsection, rather than a token count, and the citation anchor travels with the chunk through the entire pipeline including reranking.\n\nI have done retrieval over regulatory filings and internal policy libraries, not case law, so I would treat the first two weeks as learning your corpus instead of pretending I already know it. What I do bring is evaluation discipline. I want a set of real questions from the people who will use the tool, with answers a lawyer has signed off, before anyone tunes a single parameter.\n\nThree months is a sensible window for this if document access is sorted in week one. If it is not, that is usually where these projects quietly lose a month.",
    "status": "SUBMITTED",
    "proposedRateUsd": 68,
    "createdDaysAgo": 0.0625
  },
  {
    "jobSlug": "rag-legal-research-assistant-braithwood",
    "freelancerSlug": "farhan-qureshi",
    "coverLetter": "Three months is enough to build this properly if we agree on day one that the assistant does not answer questions. It finds and summarises sources for someone who will check them. Every legal RAG project I have watched fail did so because a confident wrong answer got demoed to a partner in week six and the trust never came back.\n\nMy background is agent architecture for B2B SaaS, mostly back-office work, and two of those systems ran over contract sets. One extracted obligations and renewal dates across roughly 11,000 supplier agreements. The other answered questions over a compliance manual with clause level citations and a hard refusal below a confidence threshold. Both are still in production, which I think says more than the accuracy numbers.\n\nI left the rate field empty on purpose. For a defined three month engagement I would rather agree a monthly retainer against a scoped roadmap than bill hourly. Either arrangement works, I just find the retainer keeps both sides honest about what is actually being delivered each month.",
    "status": "SHORTLISTED",
    "proposedRateUsd": null,
    "createdDaysAgo": 0.0417
  },
  {
    "jobSlug": "rag-legal-research-assistant-braithwood",
    "freelancerSlug": "jomar-batungbakal",
    "coverLetter": "Hello, I am applying for the legal research assistant role. My work is automation and chatbots for small businesses, mostly coaching and e-commerce, and I have used the OpenAI and Anthropic APIs together with vector search for a client knowledge base.\n\nI know legal is a serious field and my experience is not in law, I will not pretend otherwise. Still, I am hoping there is room for help on the smaller pieces, such as document loading, testing answers against a checklist, or building the front end. My rate is low and I can work on UK hours without any problem.",
    "status": "REJECTED",
    "proposedRateUsd": 18,
    "createdDaysAgo": 0.0208
  },
  {
    "jobSlug": "ops-workflow-automation-n8n-sable-creek",
    "freelancerSlug": "chidinma-okafor",
    "coverLetter": "Revenue ops workflows break in a very specific way. Someone renames a field in the CRM and eleven automations fail silently for three weeks, then a finance person notices the numbers are wrong. So my first question on a job like this is whether your n8n is self-hosted or cloud, and whether anybody currently looks at the executions list.\n\nI run n8n for lending and fintech clients in Lagos and Nairobi, where a silently failed workflow is somebody's disbursement, so the tolerance is zero. Everything I build ships with an error trigger, a retry policy that distinguishes a rate limit from a real failure, and an alert that names the workflow and the record that broke rather than just saying something failed. I also keep workflows in version control through the API instead of exporting JSON when someone remembers to.\n\nPart time suits me. I have around 15 hours a week available and Lagos is five hours ahead of New York, so your mornings are my afternoons and there is a comfortable overlap.",
    "status": "VIEWED",
    "proposedRateUsd": 45,
    "createdDaysAgo": 0.1875
  },
  {
    "jobSlug": "ops-workflow-automation-n8n-sable-creek",
    "freelancerSlug": "kristine-alcantara",
    "coverLetter": "Most of my automation work is on the commerce side, Shopify Flow and n8n and a lot of glue between Shopify, Klaviyo, Gorgias and Google Sheets for sellers running three or four channels at once. Revenue ops is a different vocabulary but the same shape of problem: records that have to move between systems without a person retyping them, and somebody needs to know when they do not arrive.\n\nI have built lead routing and quote to invoice flows in n8n for two agencies, including one that syncs HubSpot deals into Xero and posts a Monday summary to Slack. I am comfortable dropping into the code node when the built in ones get awkward, and I record a short Loom for every workflow so the client is never stuck waiting on me to explain how something works.\n\nPart time is exactly what I am looking for right now. I can give 12 to 15 hours a week, and I work late evenings Manila time, which lands neatly on your morning.",
    "status": "SUBMITTED",
    "proposedRateUsd": 34,
    "createdDaysAgo": 0.125
  },
  {
    "jobSlug": "ops-workflow-automation-n8n-sable-creek",
    "freelancerSlug": "jomar-batungbakal",
    "coverLetter": "I use Make and Zapier every day and this year I have been moving more work to n8n because clients want to self host. Last month I set up a flow for a coaching business that takes a Calendly booking, creates the client folder in Drive, sends the intake form, and chases it twice if it is not filled in after three days.\n\nRevenue ops is new terminology for me but the pattern looks familiar. I am available part time on your schedule and my rate is 20 dollars per hour. I would be happy to start with one workflow so you can see how I work before handing me anything bigger.",
    "status": "VIEWED",
    "proposedRateUsd": 20,
    "createdDaysAgo": 0.0625
  },
  {
    "jobSlug": "n8n-client-onboarding-automation-nasma",
    "freelancerSlug": "chidinma-okafor",
    "coverLetter": "Client onboarding is where most of my n8n work has gone, so this post reads like a description of my last four projects. For a lender in Lagos I replaced a 40 step manual checklist with a workflow that creates the client record, requests documents, waits for the compliance check, and only provisions access once that returns clean. Onboarding went from six days to under two, and the real win was not speed. It was that nobody had to remember what came next.\n\nSince you are rebuilding rather than starting fresh, I would want to see the existing workflows before proposing anything. Rebuilds almost always show that two or three flows carry 80 percent of the value and the rest are experiments nobody switched off. I map that first, then we decide together what actually gets rebuilt.\n\nI have roughly 15 hours a week and I can be online for most of your Dubai working day.",
    "status": "SHORTLISTED",
    "proposedRateUsd": 44,
    "createdDaysAgo": 8
  },
  {
    "jobSlug": "n8n-client-onboarding-automation-nasma",
    "freelancerSlug": "nour-el-sayed",
    "coverLetter": "I am in Cairo, one hour behind Dubai, and I work in Arabic and English every day. That matters here if any onboarding step sends messages or places calls to clients in the Gulf, because tone in Arabic business correspondence is not something you can safely leave to a translated template.\n\nMy main specialism is voice agents for clinics, but the machinery underneath is the same as yours. n8n orchestrating a sequence, a CRM to keep current, documents to collect, and a human who must be pulled in at exactly the right moment and not before. For a dental group in Alexandria I rebuilt patient intake in n8n behind an Arabic voice agent, with WhatsApp confirmations, calendar writes and proper retry handling when the clinic system timed out. Eleven months running, two changes requested.\n\nBefore proposing a rebuild I would ask what the current workflows are actually failing at. If it is the notifications and the handoffs, which it usually is, that is a two week fix rather than a rebuild, and I would tell you so.",
    "status": "SUBMITTED",
    "proposedRateUsd": 55,
    "createdDaysAgo": 2
  },
  {
    "jobSlug": "n8n-client-onboarding-automation-nasma",
    "freelancerSlug": "jomar-batungbakal",
    "coverLetter": "Hi, I would like to apply for the n8n onboarding work. I have built onboarding automations for coaching and agency clients before, mostly in Zapier: form to CRM, welcome sequence, contract through PandaDoc, then a reminder if it is not signed within three days.\n\nThese days I am doing more in n8n and I keep a self hosted instance on my own server for practice and small client jobs. I can work part time and my rate is flexible depending on the hours. Philippines time is four hours ahead of Dubai, which is one of the easier overlaps I deal with, most of my clients are much further away.",
    "status": "SUBMITTED",
    "proposedRateUsd": 22,
    "createdDaysAgo": 1
  },
  {
    "jobSlug": "logistics-portal-nextjs-rebuild-nordhafen",
    "freelancerSlug": "marek-wisniewski",
    "coverLetter": "Internal freight portals are slow for the same three reasons every time: a list view that loads every row, a Postgres schema shaped by whoever wrote the first CSV importer, and a search bolted on with ILIKE. I have rebuilt four B2B dashboards of this kind for companies in Germany and the Netherlands, and in every case the visible win came from the query layer, not from React.\n\nI am Polish, based in Wrocław, and the Hamburg hybrid arrangement works for me. I can be onsite for a full week at the start and then two or three days a month, more often during the first quarter if the team prefers that. I have worked exactly this way with a Munich client for two years. My German is around B1, enough for standup and for reading old documentation, not enough for a customs conversation.\n\nOne question before anything else. Is the rebuild allowed to change the data model, or does it have to keep talking to the existing schema? That single answer moves the estimate by months, and I would rather ask now than discover it in week three.",
    "status": "SHORTLISTED",
    "proposedRateUsd": 78,
    "createdDaysAgo": 27
  },
  {
    "jobSlug": "logistics-portal-nextjs-rebuild-nordhafen",
    "freelancerSlug": "marta-zielinska",
    "coverLetter": "I should say upfront that I normally argue against rebuilds. My work is adding features, mostly AI ones, inside Next.js products already carrying production traffic, and a good share of that job is convincing teams that an ugly running system is worth more than a clean rewrite. If parts of the freight portal still earn their keep, I would want to strangle it gradually rather than replace it in one release.\n\nThat said, if the decision is already made, I can do the work well. App Router, TypeScript, Postgres with Prisma or Drizzle, and I care about the unfashionable parts: server side pagination, cache invalidation that someone can explain, and not shipping a client component where a server one does the job.\n\nI am in Kraków so occasional onsite weeks in Hamburg are easy. Full time is possible from October. Before that I have a commitment I am not willing to drop on an existing client.",
    "status": "WITHDRAWN",
    "proposedRateUsd": 80,
    "createdDaysAgo": 38
  },
  {
    "jobSlug": "nextjs-logistics-portal-hamburg-nordhafen",
    "freelancerSlug": "marek-wisniewski",
    "coverLetter": "I applied to what I believe is the same team a few weeks ago, for the freight portal rebuild. If this is a second role rather than a repost, please read this as an application for both and ignore the duplicate.\n\nThe stack is exactly where I live. Next.js and Postgres for European B2B products whose dashboards have grown past what the original schema can carry. My last project was a fleet maintenance portal for a Dutch operator with about 900 vehicles, where the parts list view took 14 seconds. It ended at roughly 400 milliseconds after we moved the aggregation into the database and paginated it properly. No framework change involved.\n\nI am in Wrocław and can be in Hamburg regularly. If heavy onsite presence matters in the first month, I can arrange a longer stay. I have put 80 an hour as my contract rate, though for a permanent full time role I would rather talk about salary and what the team actually needs long term.",
    "status": "SHORTLISTED",
    "proposedRateUsd": 80,
    "createdDaysAgo": 203
  },
  {
    "jobSlug": "nextjs-logistics-portal-hamburg-nordhafen",
    "freelancerSlug": "jomar-batungbakal",
    "coverLetter": "I know the role is in Hamburg with hybrid onsite and I am in the Philippines, so let me be upfront about that before anything else. I cannot relocate this year.\n\nI am applying in case you are open to a remote contractor for part of the build. I work with React, Node and Postgres, and I have shipped several MVPs and internal tools for founders in the US and Australia. Next.js I have used on three projects, App Router with Prisma on the last two. If the answer is no because the role genuinely needs someone in the office, I completely understand, and thank you for reading this far.",
    "status": "REJECTED",
    "proposedRateUsd": 25,
    "createdDaysAgo": 8
  },
  {
    "jobSlug": "django-broker-reporting-service-braithwood",
    "freelancerSlug": "chidinma-okonkwo",
    "coverLetter": "Broker reporting is a data modelling job wearing a web app costume. Commission splits, policy versions, endorsements that retroactively change a figure, and a report someone printed last quarter that has to produce the same number today. I have built this shape of system twice for insurance and lending clients, and the piece that always gets underestimated is historical correctness, not the interface.\n\nMy stack is Django, Postgres and React. For an insurance aggregator in Lagos I built the reconciliation and reporting service, including a nightly job comparing our figures against three underwriters' statements and flagging every difference. Celery for the long running reports, materialised views where aggregation was too heavy for request time, and everything exportable to Excel, because brokers live in Excel and no amount of nice charting changes that.\n\nOn fixed price: I would want a scoping call and a short paid discovery to write the spec, otherwise any number I give you is a guess dressed up as a quote. After that I am comfortable committing to a figure and a date. The 55 below is my hourly equivalent for reference.",
    "status": "SUBMITTED",
    "proposedRateUsd": 55,
    "createdDaysAgo": 22
  },
  {
    "jobSlug": "django-broker-reporting-service-braithwood",
    "freelancerSlug": "nadia-elsherif",
    "coverLetter": "The phrase in your post that caught my attention was reporting service. Not reporting module. If the intent is genuinely to pull reporting out of whatever it currently lives inside and run it separately with its own read model, that is the work I do most: separating a piece of a monolith without stopping the business for six months while it happens.\n\nI would build it in Django against a dedicated reporting schema fed by change data capture, expose it behind a thin API, and keep the old path alive until both produce identical numbers for a full month. I have run that pattern for a payments company in Cairo and for a health insurer here. In both cases the parallel run surfaced discrepancies that had been quietly wrong for years, which was uncomfortable but valuable.\n\nI have left the rate blank deliberately. A fixed price agreed without a scope is how both sides end up resentful by month two. Give me two hours with whoever owns the current reports and I will come back with a number I am willing to stand behind.",
    "status": "VIEWED",
    "proposedRateUsd": null,
    "createdDaysAgo": 34
  },
  {
    "jobSlug": "laravel-vue-reporting-portal-braithwood",
    "freelancerSlug": "rizwan-shaikh",
    "coverLetter": "Laravel and Vue is what I work in nearly every day. Most of my clients are logistics and field service companies who ran on spreadsheets for years, then hired someone to build a portal, and now that portal is the thing slowing them down. A client reporting portal rebuild is very familiar ground for me.\n\nThe things I would check first: which Laravel version the current app is on, whether the front end is Vue 2 with the Options API, and how the reports are generated today. If they are built at request time with Eloquent loops, that is almost always where the slowness lives, and queued jobs writing into a cached results table fix it faster than any framework upgrade will. For portals like this I use Inertia, so there is one codebase and one auth path rather than a separate SPA to keep in sync.\n\nI work UK afternoons comfortably from Karachi and can give you 30 hours a week. My rate is 33 dollars an hour and I am happy to start on a small piece first.",
    "status": "SHORTLISTED",
    "proposedRateUsd": 33,
    "createdDaysAgo": 108
  },
  {
    "jobSlug": "laravel-vue-reporting-portal-braithwood",
    "freelancerSlug": "youssef-el-deeb",
    "coverLetter": "My main work now is Shopify, but before that I spent four years in WooCommerce and custom PHP, and Laravel was the framework we used for the client dashboards built alongside those shops. So the stack is not new to me even though my recent portfolio is commerce heavy.\n\nWhat I am genuinely good at is the unglamorous part, taking an old system with real data inside it and moving it to a new one without losing anything. On every migration I build a comparison script, old against new, row by row, and I do not call the work finished until the two agree. Reports follow the same logic. If a number changes after the rebuild and nobody can explain why, the client stops trusting the tool and the whole project was wasted.\n\nMy rate is 24 dollars per hour and I can start immediately. I am in Cairo, two hours ahead of the UK at this time of year.",
    "status": "SUBMITTED",
    "proposedRateUsd": 24,
    "createdDaysAgo": 7
  },
  {
    "jobSlug": "checkout-extensibility-migration-sandline-plus",
    "freelancerSlug": "zubair-hashmi",
    "coverLetter": "Three stores on checkout.liquid with a deadline is a scoping problem before it is a coding problem. The first thing I would do is list every customisation in each checkout and mark it as one of four things: replaceable by a native setting, replaceable by a checkout UI extension, replaceable by a Function, or genuinely not possible any more. In my experience about a fifth of what merchants believe they need turns out to be something no customer has used in two years.\n\nI have run this migration for four Plus merchants, all subscription brands, coffee and supplements and one pet food company, where the checkout carried a subscription app, a delivery date picker and custom line item properties. The subscription apps are the real risk. Some still have half finished extensibility support and you discover that on a sandbox, not in their documentation.\n\nTo quote firmly I would need each store's current checkout.liquid, the installed app list, and a dev store per brand. I normally deliver these in sequence, smallest store first, so stores two and three go faster on what we learn from the first.",
    "status": "VIEWED",
    "proposedRateUsd": 72,
    "createdDaysAgo": 0.1042
  },
  {
    "jobSlug": "checkout-extensibility-migration-sandline-plus",
    "freelancerSlug": "aniket-deshmukh",
    "coverLetter": "Most of my checkout work is B2B. Net terms, purchase order numbers written onto the order, tiered pricing by customer company, minimum quantities on industrial SKUs. All of that used to live in checkout.liquid and all of it now has to be rebuilt with extensions and Functions. If any of your three stores sell to trade customers, that is where I would look first, because it is where these migrations lose a feature quietly and nobody notices until a rep calls in.\n\nI have completed six of these. My sequence is a feature inventory signed off by the merchant, then a build on a dev store, then a full test order matrix covering discount stacking, gift cards and every enabled payment method, before anything touches the live checkout profile. Discount stacking is where I have seen the most complaints after go live.\n\nFixed price works for me once the inventory is agreed and written down. My hourly equivalent is 50 if it helps you compare proposals.",
    "status": "SUBMITTED",
    "proposedRateUsd": 50,
    "createdDaysAgo": 0.0625
  },
  {
    "jobSlug": "checkout-extensibility-migration-sandline-plus",
    "freelancerSlug": "jomar-batungbakal",
    "coverLetter": "Hello, thank you for posting this. I want to be honest about my level before anything else. I work on Shopify stores for small sellers, themes and apps and automation, and I have done checkout extension work once on a Plus store for a client in Australia, a custom delivery note field and a trust badge block.\n\nThree stores is bigger than anything I have led alone, so I would be more useful as a second pair of hands than as the developer in charge. I have not put a price because I would need to see the current checkouts first. If it helps, I can review one store and send you my notes on what is in there at no charge, then you can decide.",
    "status": "SUBMITTED",
    "proposedRateUsd": null,
    "createdDaysAgo": 0.1458
  },
  {
    "jobSlug": "shopify-plus-checkout-extensibility-sandline",
    "freelancerSlug": "zubair-hashmi",
    "coverLetter": "I sent a proposal to what appears to be the same programme when it was three stores. If this is the updated post with a fourth brand added, please treat this application as replacing the earlier one.\n\nThe estimate does not scale linearly with store count, and I would not quote it that way. Once the extension components exist for the first brand, stores two through four are mostly configuration, branding and a smaller set of genuinely one-off customisations. What does scale is testing, and that is where the extra budget should go: a full order matrix per store including subscriptions, discounts, gift cards and local payment methods.\n\nTwo questions that change the price materially. Are all four stores on the same Plus organisation, and do they share any theme lineage? If yes, this is a comfortable fixed price for me. If each store was built by a different agency over five years, I would want to price them separately rather than average the risk.",
    "status": "SHORTLISTED",
    "proposedRateUsd": 75,
    "createdDaysAgo": 66
  },
  {
    "jobSlug": "shopify-plus-checkout-extensibility-sandline",
    "freelancerSlug": "aniket-deshmukh",
    "coverLetter": "Four stores, one deadline, and a platform enforced cutoff is the sort of project that goes wrong when discovery gets skipped in the name of starting quickly. I would spend the first week producing a per store feature inventory with a decision written against every line, and I would want the merchant side to sign that inventory before I write code. Everything after that is predictable work with predictable hours.\n\nMy depth is on the B2B side of Plus: company accounts, catalogue based pricing, PO capture, quantity rules. If none of the four brands sell wholesale I am still a solid fit for a standard migration, but you should know where my strongest experience sits so you can weigh the other proposals fairly.\n\nI can start at the beginning of next month. I would rather quote a fixed price per store than one blended number, so a store with an unusual checkout does not end up subsidised by a simple one.",
    "status": "VIEWED",
    "proposedRateUsd": 48,
    "createdDaysAgo": 13
  },
  {
    "jobSlug": "shopify-plus-checkout-extensibility-sandline",
    "freelancerSlug": "fatima-siddiqui",
    "coverLetter": "My usual work is headless, Hydrogen storefronts for fashion brands moving off Liquid themes, which means checkout is the one part I never get to rebuild. I still know the extensibility surface closely, because every headless project ends in the same place: UI extensions, Functions and branding through the checkout profile, since that is all any of us are given now.\n\nWhere I could be most useful to you is if any of the four brands are already thinking about a storefront replatform. Doing the checkout migration in isolation and then rebuilding the storefront eight months later means paying for the same discovery twice and re-testing the same order flows twice.\n\nI have not proposed a rate because it depends entirely on whether this is only the checkout work or the front end of something larger. If it is strictly four checkouts and nothing more, there are specialists who do that every day and I am honestly not the cheapest way to buy it.",
    "status": "WITHDRAWN",
    "proposedRateUsd": null,
    "createdDaysAgo": 33
  },
  {
    "jobSlug": "shopify-plus-checkout-extensibility-sandline",
    "freelancerSlug": "jomar-batungbakal",
    "coverLetter": "I applied to your other post about three stores and I am applying here too since the requirements look almost the same. Apologies if this reaches you twice.\n\nTo be clear about my level again: I do theme work, app setup and automation for small Shopify sellers, and I have touched checkout extensions once on a Plus store. I would be a helper here, not the lead developer. What I can genuinely take off someone's plate is the repetitive work, testing every payment and discount combination on the dev stores, writing the feature list per brand, checking shipping rules after each launch. My rate is 20 dollars an hour and I can work long days during a launch week.",
    "status": "SUBMITTED",
    "proposedRateUsd": 20,
    "createdDaysAgo": 11
  },
  {
    "jobSlug": "klaviyo-flows-product-feed-cleanup-wildmoor",
    "freelancerSlug": "chinedu-okafor",
    "coverLetter": "Janitorial supply is a long way from the fashion labels I usually work with, but the Klaviyo problems are identical and the feed problems are probably worse for you, because a supply catalogue is full of variants Google reads as duplicates. Case packs, sizes, scent variants, refill versus starter kit. That causes more disapprovals than the missing GTINs everyone blames first.\n\nOn flows, I would check whether your abandoned checkout and browse abandonment are competing for the same shopper, which is the most common reason a store's email revenue flattens out. Then the post purchase flow, which for a supply business should be a replenishment reminder timed to the actual product life, not a generic thank you on day seven. I built exactly that for a haircare brand and the reorder series ended up outperforming their welcome flow.\n\nI bill 30 an hour. My rough guess is 20 to 30 hours to fix this properly, then a few hours a month to keep the feed clean as products change.",
    "status": "SUBMITTED",
    "proposedRateUsd": 30,
    "createdDaysAgo": 0
  },
  {
    "jobSlug": "klaviyo-flows-product-feed-cleanup-wildmoor",
    "freelancerSlug": "youssef-el-deeb",
    "coverLetter": "I do migrations mostly, WooCommerce to Shopify for retailers in Egypt, Saudi and the UAE with large catalogues that were never kept tidy. Cleaning a product feed is half of every migration I have done, so this part of your job is ordinary daily work for me: titles that follow one consistent pattern, GTIN and MPN where the supplier actually provided them, correct product type and Google category, and variants grouped so they stop competing with each other in Shopping.\n\nKlaviyo I know at a working level. Welcome, abandoned cart, browse, post purchase, win back, plus the segments underneath them. I can build and test all of that.\n\nOne honest note. I am not an email copywriter. If you also need someone to write the emails themselves, hire that separately, or accept that my written English is functional rather than persuasive. My rate is 22 dollars per hour.",
    "status": "REJECTED",
    "proposedRateUsd": 22,
    "createdDaysAgo": 41
  },
  {
    "jobSlug": "klaviyo-flows-product-feed-cleanup-wildmoor",
    "freelancerSlug": "jomar-batungbakal",
    "coverLetter": "Klaviyo flows are one of the things I do most. For a homeware seller in Manila I built welcome, abandoned cart, browse abandonment and a win back series, and email went from almost nothing to around 14 percent of store revenue within four months.\n\nThe Google product feed part I have done twice, mostly clearing disapprovals for missing GTIN and wrong product category. I fix the fields in the product data itself rather than patching them with feed rules, so the next inventory import does not undo the work.\n\nMy rate is 18 dollars per hour and I am available now. Small tasks are welcome too, I do not need a large project to get started.",
    "status": "SUBMITTED",
    "proposedRateUsd": 18,
    "createdDaysAgo": 19
  }
],

  engagements: [
  {
    "key": "eng-braithwood-aditya-rag-support-engine",
    "jobSlug": "rag-support-answer-engine-zendesk-braithwood",
    "freelancerSlug": "aditya-ranganathan",
    "recruiterSlug": "braithwood-digital",
    "statedRateUsd": 70,
    "durationWeeks": 14,
    "freelancerConfirmed": true,
    "recruiterConfirmed": true,
    "reviews": [
      {
        "authorSide": "RECRUITER",
        "rating": 4,
        "body": "We brought Aditya in to build a support answer engine over roughly nine years of Zendesk history, about 340,000 tickets, most of it tagged inconsistently by four different support managers. He spent the first two weeks on the unglamorous part: deduplicating threads, stripping signature blocks and quoted replies, and throwing out the macros that would have poisoned every answer. That is the reason retrieval quality was usable by week five instead of month three. Tier one deflection went from zero to 31 percent in the first month live, measured on our own baseline rather than a number he invented.\n\nThe reservation is scheduling. Aditya prefers to work late in his own timezone and our support leads are on London hours, so a question raised at 4pm often sat until the following morning. He moved two days a week earlier once we raised it, but we should have written the overlap into the agreement at the start rather than negotiating it in week six. On the engineering itself I would hire him again without thinking about it."
      },
      {
        "authorSide": "FREELANCER",
        "rating": 5,
        "body": "Braithwood decided what good looked like before I wrote a line of code, which almost never happens. Their head of support sat with me for two hours and hand labelled 200 real customer questions with the answers she expected to see, and that set governed every retrieval decision I made for the next three months. No arguing about vibes.\n\nThey were also willing to say no properly. When I proposed fine tuning a reranker, they asked what it would cost in latency and in maintenance once I was gone, listened to the honest answer, and shelved it. Invoices were paid within a week every single time, and nobody asked me to work a weekend. I would take another contract from them tomorrow."
      }
    ]
  },
  {
    "key": "eng-braithwood-rizwan-laravel-reporting-portal",
    "jobSlug": "laravel-vue-reporting-portal-braithwood",
    "freelancerSlug": "rizwan-shaikh",
    "recruiterSlug": "braithwood-digital",
    "statedRateUsd": 34,
    "durationWeeks": 11,
    "freelancerConfirmed": true,
    "recruiterConfirmed": true,
    "reviews": [
      {
        "authorSide": "RECRUITER",
        "rating": 5,
        "body": "Rizwan rebuilt the client reporting portal that three previous contractors had each left half finished. He took us to Laravel 11 and moved the front end to Vue 3 with the composition API in stages, so the portal never went dark outside the scheduled Sunday windows. The PDF export that used to time out on any account with more than 400 line items now completes in under four seconds, and the scheduled monthly run stopped needing someone to babysit it.\n\nWhat mattered as much as the code was the Friday summary he wrote every week in plain English that our account managers could actually read. He flagged two data integrity problems in the old schema that we had been silently living with since 2021. At his rate he is badly underpriced for this level of care."
      },
      {
        "authorSide": "FREELANCER",
        "rating": 4,
        "body": "Solid client. The brief was written by someone who had genuinely used the old portal, so the requirements matched what I found in the codebase instead of a wish list. Nobody messaged me at midnight, scope changes came with a conversation about time rather than an assumption, and the contract was extended twice on the same terms.\n\nOne honest note for anyone considering them: production database access took eleven days to arrange because of an internal security review that was never mentioned during the interview. I lost most of the second week guessing at data shapes from a stale dump, and that time came out of my own estimate. Ask about compliance steps and their timelines before you commit to a start date. Everything financial was exactly as agreed."
      }
    ]
  },
  {
    "key": "eng-sandline-zubair-checkout-extensibility",
    "jobSlug": "shopify-plus-checkout-extensibility-sandline",
    "freelancerSlug": "zubair-hashmi",
    "recruiterSlug": "sandline-commerce",
    "statedRateUsd": 70,
    "durationWeeks": 6,
    "freelancerConfirmed": true,
    "recruiterConfirmed": false,
    "reviews": []
  },
  {
    "key": "eng-nordhafen-marek-hamburg-logistics-portal",
    "jobSlug": "nextjs-logistics-portal-hamburg-nordhafen",
    "freelancerSlug": "marek-wisniewski",
    "recruiterSlug": "nordhafen-systeme",
    "statedRateUsd": 80,
    "durationWeeks": 26,
    "freelancerConfirmed": false,
    "recruiterConfirmed": false,
    "reviews": []
  }
],
};
