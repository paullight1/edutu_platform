import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth';
import { GoalsModule } from './goals/goals.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { CreatorModule } from './creator/creator.module';
import { QuizModule } from './quiz/quiz.module';
import { FlashcardsModule } from './flashcards/flashcards.module';
import { BlogModule } from './blog/blog.module';
import { ScraperModule } from './scraper/scraper.module';
import { CvModule } from './cv/cv.module';
import { RoadmapsModule } from './roadmaps/roadmaps.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    GoalsModule,
    OpportunitiesModule,
    CreatorModule,
    QuizModule,
    FlashcardsModule,
    BlogModule,
    ScraperModule,
    CvModule,
    RoadmapsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
