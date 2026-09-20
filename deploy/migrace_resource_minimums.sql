-- Volitelná minimální délka rezervace pro konkrétní stůl nebo trenéra.
-- NULL znamená, že se použije výchozí hodnota typu rezervace.

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS min_booking_slots int(11) NULL AFTER is_active;
