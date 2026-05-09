import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CvService } from './cv.service';
import type { GenerateCVDraftDto, TailorCVDto } from './dto/cv-ai.dto';

@Controller('cv')
export class CvController {
  constructor(private readonly cvService: CvService) {}

  @Post('ai/draft')
  generateDraft(
    @CurrentUser('id') userId: string,
    @Body() dto: GenerateCVDraftDto,
  ) {
    return this.cvService.generateDraft(userId, dto || {});
  }

  @Post('ai/tailor')
  tailor(@CurrentUser('id') userId: string, @Body() dto: TailorCVDto) {
    return this.cvService.tailor(userId, dto);
  }
}
