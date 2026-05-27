import { Module } from '@nestjs/common';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';
import { AiModule } from '../ai';
import { OpportunitiesModule } from '../opportunities/opportunities.module';

@Module({
  imports: [AiModule, OpportunitiesModule],
  controllers: [ScraperController],
  providers: [ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
