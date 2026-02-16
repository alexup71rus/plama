export type Theme = 'light' | 'dark' | 'system';
export type SearchFormat = 'html' | 'json';
export type MaxMessages = 5 | 10 | 20 | 50 | 100;

export type SystemPrompt = {
  title: string;
  content: string;
};

export const DEFAULT_SETTINGS = {
  isAsideOpen: false as boolean,
  backendURL: 'http://localhost:3001' as string,
  ollamaURL: 'http://localhost:11434' as string,
  selectedModel: '' as string,
  defaultModel: '' as string,
  memoryModel: '' as string,
  searchModel: '' as string,
  searxngURL: 'http://localhost:8888/search?q=%s&format=json' as string,
  searchFormat: 'json' as SearchFormat,
  defaultChatTitle: 'New chat' as string,
  theme: 'dark' as Theme,
  isSearchAsDefault: false as boolean,
  chatScrollMode: 'scroll' as 'gap' | 'scroll',
  systemPrompts: [
    { title: 'Default Assistant', content: 'You are a helpful assistant' },
  ] as SystemPrompt[],
  defaultSystemPrompt: {
    title: 'Default Assistant',
    content: 'You are a helpful assistant',
  } as SystemPrompt,
  systemModel: '' as string,
  titlePrompt:
    'Generate a concise chat title (2-5 words, up to 50 characters) summarizing the topic based on the provided messages. Use the same language as the user’s message. Include a relevant emoji only if it enhances clarity. Return the title as plain text. Examples:\n' +
    '- English: "🐍 Python Snake Game" for user: "Write a snake game in Python"\n' +
    '- Russian: "👋 Привет" for user: "Привет"\n' +
    '- Russian: "🐱 Вибриссы у котов" for user: "Как называются усы у котов?"\n' +
    '- French: "🇫🇷 Voyage à Paris" for user: "Plan a trip to Paris"\n' +
    '- Spanish: "🍜 Receta de Ramen" for user: "Escribe una receta de ramen"',
  memoryPrompt:
    "Summarize one key piece of information (up to 50 characters) from the provided chat messages, capturing the user's preferences, background, interests, or discussion context. Use the same language as the user's messages. Focus on a concise, memorable detail or theme. Examples:\n" +
    '- English: "User explores TypeScript benefits." for a TypeScript chat\n' +
    '- Russian: "Пользователь интересуется вибриссами." for "Как называются усы у котов?"\n' +
    '- Spanish: "Usuario aprende frameworks JS." for a JS frameworks chat\n' +
    '- French: "Utilisateur passionné de voyage." for a travel chat',
  searchPrompt:
    "Formulate a concise search query (up to 100 characters) based on the user's input, capturing the main intent or topic. Use the same language as the user's message. Optimize for clarity and relevance to retrieve accurate search results. Examples:\n" +
    '- English: "TypeScript best practices" for user: "What are the best practices for TypeScript?"\n' +
    '- Russian: "вибриссы котов" for user: "Как называются усы у котов?"\n' +
    '- Spanish: "receta ramen casera" for user: "Escribe una receta de ramen"\n' +
    '- French: "plan voyage Paris" for user: "Plan a trip to Paris"',
  ragPrompt:
    'Extract relevant information from provided documents and generate a concise, accurate response based on the user’s query.' as string,
  searchResultsLimit: 3 as number,
  followSearchLinks: false as boolean,
  maxMessages: 20 as MaxMessages,
  embeddingsModel: '' as string,
  ragFiles: [] as string[],
  selectedRagFiles: [] as string[],
  showToolbarLabels: true as boolean,
  showSendButton: true as boolean,
};

export type ISettings = {
  [K in keyof typeof DEFAULT_SETTINGS]: (typeof DEFAULT_SETTINGS)[K];
};
