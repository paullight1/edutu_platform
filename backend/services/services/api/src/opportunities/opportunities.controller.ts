import type { CreateOpportunityDto } from './dto/create-opportunity.dto';
import type {
  OpportunityPreferenceDto,
  OpportunitySignalDto,
  RecommendationQueryDto,
  UserRecommendationRequestDto,
} from './dto/personalization.dto';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { CurrentUser, Public, AdminGuard } from '../auth';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Public()
  @Get()
  findAll(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.opportunitiesService.findAll(limit, offset, status, category);
  }

  @Post('recommendations/query')
  @Public()
  queryRecommendations(@Body() body: RecommendationQueryDto) {
    return this.opportunitiesService.queryRecommendations(body);
  }

  @Post('recommendations')
  getRecommendations(
    @CurrentUser('id') userId: string,
    @Body() body: UserRecommendationRequestDto,
  ) {
    return this.opportunitiesService.getPersonalizedRecommendations(
      userId,
      body || {},
    );
  }

  @Get('preferences')
  getPreferences(@CurrentUser('id') userId: string) {
    return this.opportunitiesService.getUserOpportunityPreferences(userId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() body: OpportunityPreferenceDto,
  ) {
    return this.opportunitiesService.updateUserOpportunityPreferences(
      userId,
      body || {},
    );
  }

  @Post('signals')
  recordSignal(
    @CurrentUser('id') userId: string,
    @Body() body: OpportunitySignalDto,
  ) {
    return this.opportunitiesService.recordUserOpportunitySignal(userId, body);
  }

  @Get('sync')
  @UseGuards(AdminGuard)
  triggerSync() {
    return this.opportunitiesService.syncOpportunities();
  }

  @Get('admin/list')
  @UseGuards(AdminGuard)
  findAdminList(
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    return this.opportunitiesService.findAdminList({
      limit,
      page,
      search,
      status,
      category,
      sortBy,
    });
  }

  @Get('admin/stats')
  @UseGuards(AdminGuard)
  getAdminStats() {
    return this.opportunitiesService.getAdminStats();
  }

  @Get('apify-sync')
  @UseGuards(AdminGuard)
  async triggerApifySync(@Query('sources') sources?: string) {
    return this.opportunitiesService.syncFromApify(sources);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createDto: CreateOpportunityDto) {
    return this.opportunitiesService.create(createDto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateData: Partial<CreateOpportunityDto>,
  ) {
    return this.opportunitiesService.update(id, updateData);
  }

  @Patch(':id/status')
  @UseGuards(AdminGuard)
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.opportunitiesService.updateStatus(id, status);
  }

  @Post(':id/approve')
  @UseGuards(AdminGuard)
  approve(@Param('id') id: string) {
    return this.opportunitiesService.updateStatus(id, 'active');
  }

  @Post(':id/reject')
  @UseGuards(AdminGuard)
  reject(@Param('id') id: string) {
    return this.opportunitiesService.updateStatus(id, 'rejected');
  }

  @Post('bulk-import')
  @Public()
  async bulkImport(@Body() body: { items: any[]; apiKey?: string }) {
    const expectedApiKey = process.env.APIFY_WEBHOOK_API_KEY;
    if (!expectedApiKey) {
      throw new Error('Bulk import is disabled: APIFY_WEBHOOK_API_KEY not configured');
    }
    if (body.apiKey !== expectedApiKey) {
      throw new Error('Invalid API key');
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('Items array is required and must not be empty');
    }
    return this.opportunitiesService.bulkImport(body.items);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.opportunitiesService.remove(id);
  }
}
