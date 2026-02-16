import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { ChatsModule } from './chats/chats.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppResolver } from './app.resolver';
import { SearchModule } from './search/search.module';
import { MemoryModule } from './memory/memory.module';
import { LinkParserModule } from './link-parser/link-parser.module';
import { WebUtilsModule } from './web-utils/web-utils.module';
import { RagModule } from './rag/rag.module';
import { SettingsModule } from './settings/settings.module';
import { EventsModule } from './event/events.module';

import { ensureDataDir } from './common/data-dir';

const basePath = ensureDataDir();

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(basePath, 'schema.gql'),
      playground: true,
      context: ({ req }: { req: unknown }) => ({ req }),
      subscriptions: {
        'graphql-ws': true,
      },
    }),
    TypeOrmModule.forRoot({
      type: 'sqljs',
      database: new Uint8Array(),
      location: join(basePath, 'db.sqlite'),
      autoSave: true,
      entities: [`${__dirname}/**/*.entity{.ts,.js}`],
      synchronize: true, // TODO: use migrations
    }),

    ChatsModule,
    MemoryModule,
    WebUtilsModule,
    SearchModule,
    LinkParserModule,
    RagModule,
    EventsModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule {}
