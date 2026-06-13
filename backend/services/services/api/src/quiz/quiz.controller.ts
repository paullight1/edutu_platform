import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { QuizService } from "./quiz.service";
import { GenerateQuizDto, SubmitQuizDto } from "./dto/generate-quiz.dto";
import { CurrentUser } from "../auth/current-user.decorator";
import { AdminGuard } from "../auth/admin.guard";

@Controller("quiz")
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post("generate")
  generate(@CurrentUser("id") userId: string, @Body() dto: GenerateQuizDto) {
    return this.quizService.generate(userId, dto);
  }

  @Get()
  findAll(@CurrentUser("id") userId: string) {
    return this.quizService.findAllByUser(userId);
  }

  @Get(":id")
  findOne(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.quizService.findOne(userId, id);
  }

  @Post(":id/submit")
  submit(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quizService.submit(userId, id, dto);
  }

  @Get(":id/attempts")
  getAttempts(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.quizService.getAttempts(userId, id);
  }

  @Delete(":id")
  @UseGuards(AdminGuard)
  remove(@Param("id") id: string) {
    return this.quizService.remove(id);
  }
}
