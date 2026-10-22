-- Lets a user keep their own list of "Update resume with AI" preset instructions,
-- seeded with the app's built-in defaults, which they can then add to or trim.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS resume_ai_presets JSONB NOT NULL DEFAULT '[
  "Tailor the whole resume to the target job description",
  "Make every bullet start with a strong action verb and add measurable impact where the facts allow",
  "Make all certifications and achievements in one",
  "remove second education keep only btech''s details",
  "flow of the resume skills-->experience-->projects-->education-->certifications+achievements"
]'::jsonb;
  