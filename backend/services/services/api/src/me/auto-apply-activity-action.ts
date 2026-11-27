export const autoApplyActivityActionLabels = {
  provider_step: "Complete a provider step",
  pdf: "Choose a supporting PDF",
  cv: "Choose a CV",
  statement: "Write your statement",
  answer_format: "Check your answer format",
  correction: "Correct your draft",
};

export type AutoApplyActivityAction =
  keyof typeof autoApplyActivityActionLabels;

// Use the same public action codes in the attempt API and both push transports.
// These codes describe the next step without copying any application content.
export const autoApplyActivityActionSql = `case
  when attempt.state = 'needs_input' then case
    when attempt.handoff_required then 'provider_step'
    when attempt.question_attachment then 'pdf'
    when attempt.question_cv then 'cv'
    when attempt.question_statement then 'statement'
    when attempt.question_answer_hint is not null then 'answer_format'
  end
  when attempt.state = 'needs_review' and attempt.review @? '$[*].validationHint'
    then 'correction'
end`;
