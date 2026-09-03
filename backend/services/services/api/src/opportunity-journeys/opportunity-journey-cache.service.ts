import { Injectable } from "@nestjs/common";
import { CacheService } from "../common/cache/cache.service";
import { toDatabaseUserId } from "../common/user-id";

const HOME_CACHE_TTL_SECONDS = 30;

@Injectable()
export class OpportunityJourneyCacheService {
  constructor(private readonly cache: CacheService) {}

  private prefix(userId: string): string {
    return `opportunity-pipeline:${toDatabaseUserId(userId)}:`;
  }

  homeKey(userId: string, recommendationLimit: number): string {
    return `${this.prefix(userId)}home:${recommendationLimit}`;
  }

  wrapHome<T>(
    userId: string,
    recommendationLimit: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    return this.cache.wrap(
      this.homeKey(userId, recommendationLimit),
      HOME_CACHE_TTL_SECONDS,
      producer,
    );
  }

  invalidateUser(userId: string): Promise<void> {
    return this.cache.delByPrefix(this.prefix(userId));
  }
}
