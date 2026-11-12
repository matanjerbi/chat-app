-- While the site is new, keep only three rooms visible (the rest can be re-enabled from admin → rooms)
UPDATE rooms SET hidden=1 WHERE official=1 AND id NOT IN ('salon','flirt','hot');
