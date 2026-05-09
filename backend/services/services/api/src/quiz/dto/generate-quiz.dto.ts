export class GenerateQuizDto {
  topic: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  questionCount?: number;
  description?: string;
}

export class SubmitQuizDto {
  answers: number[];
}
