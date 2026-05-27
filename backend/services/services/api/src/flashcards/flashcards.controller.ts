import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import {
  CreateFlashcardDeckDto,
  CreateFlashcardDto,
  UpdateFlashcardDeckDto,
  UpdateFlashcardDto,
  ReviewFlashcardDto,
  CreateStudySessionDto,
  GenerateFlashcardsDto,
} from './dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { AdminGuard } from '../auth/admin.guard';

@Controller('flashcards')
export class FlashcardsController {
  constructor(private readonly flashcardsService: FlashcardsService) {}

  @Post('decks')
  createDeck(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFlashcardDeckDto,
  ) {
    return this.flashcardsService.createDeck(userId, dto);
  }

  @Get('decks')
  getDecks(@CurrentUser('id') userId: string) {
    return this.flashcardsService.findAllDecksByUser(userId);
  }

  @Public()
  @Get('decks/public')
  getPublicDecks(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.flashcardsService.findPublicDecks(
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('decks/:id')
  getDeck(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.flashcardsService.findDeckById(id, userId);
  }

  @Get('decks/:id/cards')
  getDeckWithCards(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.flashcardsService.findDeckWithCards(id, userId);
  }

  @Put('decks/:id')
  updateDeck(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFlashcardDeckDto,
  ) {
    return this.flashcardsService.updateDeck(id, userId, dto);
  }

  @Delete('decks/:id')
  deleteDeck(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.flashcardsService.deleteDeck(id, userId);
  }

  @Post('cards')
  createCard(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFlashcardDto,
  ) {
    return this.flashcardsService.createCard(userId, dto);
  }

  @Post('cards/bulk')
  createCards(
    @CurrentUser('id') userId: string,
    @Body() cards: CreateFlashcardDto[],
  ) {
    return this.flashcardsService.createCards(userId, cards);
  }

  @Put('cards/:id')
  updateCard(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFlashcardDto,
  ) {
    return this.flashcardsService.updateCard(id, userId, dto);
  }

  @Delete('cards/:id')
  deleteCard(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.flashcardsService.deleteCard(id, userId);
  }

  @Get('decks/:deckId/review')
  getCardsForReview(
    @CurrentUser('id') userId: string,
    @Param('deckId') deckId: string,
    @Query('limit') limit?: string,
  ) {
    return this.flashcardsService.getCardsForReview(
      deckId,
      userId,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  @Post('cards/:cardId/review')
  reviewCard(
    @CurrentUser('id') userId: string,
    @Param('cardId') cardId: string,
    @Body() dto: ReviewFlashcardDto,
  ) {
    return this.flashcardsService.reviewCard(cardId, userId, dto);
  }

  @Post('sessions')
  createStudySession(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateStudySessionDto,
  ) {
    return this.flashcardsService.createStudySession(userId, dto);
  }

  @Get('stats')
  getStudyStats(@CurrentUser('id') userId: string) {
    return this.flashcardsService.getStudyStats(userId);
  }

  @Post('generate')
  @UseGuards(AdminGuard)
  generateFlashcards(@Body() dto: GenerateFlashcardsDto) {
    return this.flashcardsService.generateFlashcards(dto);
  }
}
