import { Module } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunityRankingService } from './opportunity-ranking.service';
import { AiModule } from '../ai';

@Module({
  imports: [AiModule],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService, OpportunityRankingService],
})
export class OpportunitiesModule {}
