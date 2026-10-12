-- Enable pgvector for semantic search
create extension if not exists vector;

-- Users (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'agency')),
  stripe_customer_id text,
  applications_this_month int not null default 0,
  plan_reset_at timestamptz not null default date_trunc('month', now()) + interval '1 month',
  created_at timestamptz not null default now()
);

-- Resumes
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  file_path text,                          -- Supabase Storage path
  content_text text not null,             -- Raw parsed text
  embedding vector(1536),                 -- Claude text-embedding-3-small compatible
  variants jsonb default '[]',            -- [{label, content, created_at}]
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index resumes_user_id_idx on public.resumes(user_id);
create index resumes_embedding_idx on public.resumes
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Job listings (scraped from boards)
create table public.job_listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text not null,
  location text,
  remote_ok boolean default false,
  board text not null,                    -- 'linkedin' | 'indeed' | 'wellfound' | 'remoteok' | ...
  external_id text,                       -- board-specific job id
  url text not null unique,
  jd_text text not null,                  -- full job description text
  embedding vector(1536),
  salary_min int,
  salary_max int,
  salary_currency text default 'USD',
  scraped_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint unique_board_job unique (board, external_id)
);
create index job_listings_board_idx on public.job_listings(board);
create index job_listings_scraped_at_idx on public.job_listings(scraped_at desc);
create index job_listings_embedding_idx on public.job_listings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Applications (one per user+job)
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_id uuid not null references public.job_listings(id),
  resume_id uuid references public.resumes(id),
  resume_variant_label text,              -- which variant was used
  cover_letter_text text,
  match_score float check (match_score between 0 and 1),
  status text not null default 'pending_review'
    check (status in (
      'pending_review',   -- tailor generated, waiting user approval
      'approved',         -- user approved, ready to apply
      'applying',         -- ApplierAgent in progress
      'applied',          -- successfully submitted
      'bounced',          -- submission failed
      'replied',          -- recruiter/company responded
      'interview',        -- interview scheduled
      'offer',            -- offer received
      'rejected',         -- explicit rejection
      'ghosted',          -- no response after 3+ weeks
      'withdrawn'         -- user withdrew
    )),
  applied_at timestamptz,
  last_event_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create index applications_user_id_idx on public.applications(user_id);
create index applications_status_idx on public.applications(status);
create index applications_created_at_idx on public.applications(created_at desc);
create unique index applications_unique_idx on public.applications(user_id, job_id);

-- Pipeline events (audit log for each application)
create table public.pipeline_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  event_type text not null,               -- 'status_change' | 'email_received' | 'calendar_event' | 'agent_action'
  from_status text,
  to_status text,
  payload jsonb default '{}',
  source text,                            -- 'inbox_agent' | 'scheduler_agent' | 'user' | 'applier_agent'
  created_at timestamptz not null default now()
);
create index pipeline_events_app_id_idx on public.pipeline_events(application_id);
create index pipeline_events_created_at_idx on public.pipeline_events(created_at desc);

-- Interview sessions
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  application_id uuid references public.applications(id),
  type text not null check (type in ('phone_screen', 'technical', 'behavioral', 'onsite', 'offer_call', 'followup')),
  scheduled_at timestamptz,
  duration_minutes int default 60,
  google_calendar_event_id text,
  interviewer_names text[],
  prep_notes text,                        -- AI-generated prep notes
  outcome text,                           -- post-session notes
  created_at timestamptz not null default now()
);
create index sessions_user_id_idx on public.sessions(user_id);
create index sessions_scheduled_at_idx on public.sessions(scheduled_at);

-- ATS knowledge base (from kedster pattern — self-updating)
create table public.ats_knowledge (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('site', 'ats_playbook', 'dropdown_map')),
  key text not null,                       -- e.g. 'workday' | 'greenhouse' | 'linkedin'
  content jsonb not null,
  updated_at timestamptz not null default now(),
  constraint unique_ats_key unique (category, key)
);

-- Row Level Security
alter table public.users enable row level security;
alter table public.resumes enable row level security;
alter table public.applications enable row level security;
alter table public.pipeline_events enable row level security;
alter table public.sessions enable row level security;

-- Users can only see their own data
create policy "users_own_data" on public.users
  for all using (auth.uid() = id);

create policy "resumes_own_data" on public.resumes
  for all using (auth.uid() = user_id);

create policy "applications_own_data" on public.applications
  for all using (auth.uid() = user_id);

create policy "pipeline_events_own_data" on public.pipeline_events
  for all using (
    application_id in (
      select id from public.applications where user_id = auth.uid()
    )
  );

create policy "sessions_own_data" on public.sessions
  for all using (auth.uid() = user_id);

-- Job listings are public read
alter table public.job_listings enable row level security;
create policy "job_listings_public_read" on public.job_listings
  for select using (true);

-- ATS knowledge is service-role write, public read
alter table public.ats_knowledge enable row level security;
create policy "ats_knowledge_public_read" on public.ats_knowledge
  for select using (true);

-- Helper: semantic job search function
create or replace function public.match_jobs_for_resume(
  resume_embedding vector(1536),
  match_threshold float default 0.72,
  match_count int default 10
)
returns table (
  id uuid,
  title text,
  company text,
  board text,
  url text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    j.id,
    j.title,
    j.company,
    j.board,
    j.url,
    1 - (j.embedding <=> resume_embedding) as similarity
  from public.job_listings j
  where 1 - (j.embedding <=> resume_embedding) > match_threshold
    and j.expires_at is null or j.expires_at > now()
  order by j.embedding <=> resume_embedding
  limit match_count;
end;
$$;

-- Trigger: auto-create user record on auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
