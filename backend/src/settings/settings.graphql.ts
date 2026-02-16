import {
  Field,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}
registerEnumType(Theme, { name: 'Theme' });

export enum SearchFormat {
  HTML = 'html',
  JSON = 'json',
}
registerEnumType(SearchFormat, { name: 'SearchFormat' });

export enum ChatScrollMode {
  GAP = 'gap',
  SCROLL = 'scroll',
}
registerEnumType(ChatScrollMode, { name: 'ChatScrollMode' });

export enum MaxMessages {
  FIVE = 5,
  TEN = 10,
  TWENTY = 20,
  FIFTY = 50,
  HUNDRED = 100,
}
registerEnumType(MaxMessages, { name: 'MaxMessages' });

@ObjectType()
export class SystemPrompt {
  @Field()
  title: string;

  @Field()
  content: string;
}

@InputType()
export class SystemPromptInput {
  @Field()
  title: string;

  @Field()
  content: string;
}

@ObjectType()
export class Settings {
  @Field()
  isAsideOpen: boolean;

  @Field()
  backendURL: string;

  @Field()
  ollamaURL: string;

  @Field()
  selectedModel: string;

  @Field()
  defaultModel: string;

  @Field()
  memoryModel: string;

  @Field()
  searchModel: string;

  @Field()
  searxngURL: string;

  @Field(() => String)
  searchFormat: string;

  @Field()
  defaultChatTitle: string;

  @Field(() => String)
  theme: string;

  @Field()
  isSearchAsDefault: boolean;

  @Field(() => String)
  chatScrollMode: string;

  @Field(() => [SystemPrompt])
  systemPrompts: SystemPrompt[];

  @Field(() => SystemPrompt)
  defaultSystemPrompt: SystemPrompt;

  @Field()
  systemModel: string;

  @Field()
  titlePrompt: string;

  @Field()
  memoryPrompt: string;

  @Field()
  searchPrompt: string;

  @Field()
  ragPrompt: string;

  @Field(() => Int)
  searchResultsLimit: number;

  @Field()
  followSearchLinks: boolean;

  @Field(() => Int)
  maxMessages: number;

  @Field()
  embeddingsModel: string;

  @Field(() => [String])
  ragFiles: string[];

  @Field(() => [String])
  selectedRagFiles: string[];

  @Field()
  showToolbarLabels: boolean;

  @Field()
  showSendButton: boolean;
}

@InputType()
export class SettingsInput {
  @Field()
  isAsideOpen: boolean;

  @Field()
  backendURL: string;

  @Field()
  ollamaURL: string;

  @Field()
  selectedModel: string;

  @Field()
  defaultModel: string;

  @Field()
  memoryModel: string;

  @Field()
  searchModel: string;

  @Field()
  searxngURL: string;

  @Field(() => String)
  searchFormat: string;

  @Field()
  defaultChatTitle: string;

  @Field(() => String)
  theme: string;

  @Field()
  isSearchAsDefault: boolean;

  @Field(() => String)
  chatScrollMode: string;

  @Field(() => [SystemPromptInput])
  systemPrompts: SystemPromptInput[];

  @Field(() => SystemPromptInput)
  defaultSystemPrompt: SystemPromptInput;

  @Field()
  systemModel: string;

  @Field()
  titlePrompt: string;

  @Field()
  memoryPrompt: string;

  @Field()
  searchPrompt: string;

  @Field()
  ragPrompt: string;

  @Field(() => Int)
  searchResultsLimit: number;

  @Field()
  followSearchLinks: boolean;

  @Field(() => Int)
  maxMessages: number;

  @Field()
  embeddingsModel: string;

  @Field(() => [String])
  ragFiles: string[];

  @Field(() => [String])
  selectedRagFiles: string[];

  @Field()
  showToolbarLabels: boolean;

  @Field()
  showSendButton: boolean;
}
