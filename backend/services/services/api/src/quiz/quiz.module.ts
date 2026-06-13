import { Module } from "@nestjs/common";
import { QuizService } from "./quiz.service";
import { QuizController } from "./quiz.controller";
import { AiModule } from "../ai";

@Module({
  imports: [AiModule],
  controllers: [QuizController],
  providers: [QuizService],
})
export class QuizModule {}
