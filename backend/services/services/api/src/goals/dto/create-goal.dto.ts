export class CreateGoalDto {
  title: string;
  description?: string;
  category?: string;
  targetDate?: string; // ISO Date string
}
