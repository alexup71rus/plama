import {
  Args,
  Context,
  Field,
  Int,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { SearchService } from './search.service';

@ObjectType()
export class SearchResult {
  @Field(() => String, { nullable: false })
  results: string;
}

@Resolver()
export class SearchResolver {
  constructor(private readonly searchService: SearchService) {}

  private getAcceptLanguage(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    // Avoid header abuse / extremely long values.
    return trimmed.slice(0, 128);
  }

  @Query(() => SearchResult)
  async search(
    @Args('query', { type: () => String }) query: string,
    @Args('url', { type: () => String }) url: string,
    @Args('format', { type: () => String }) format: 'json' | 'html',
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('followLinks', { type: () => Boolean, nullable: true })
    followLinks?: boolean,
    @Context('req') req?: { headers?: Record<string, unknown> },
  ): Promise<SearchResult> {
    const acceptLanguage = this.getAcceptLanguage(
      req?.headers?.['accept-language'],
    );

    const results = await this.searchService.search(
      query,
      url,
      format,
      limit,
      followLinks,
      acceptLanguage,
    );
    return { results };
  }
}
