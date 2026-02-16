import { getGraphQLClient, handleGraphQLError } from '@/utils/graphql';
import { gql } from 'graphql-tag';
import {
  type Chat,
  type ChatMeta,
  type LinkContent,
  type MemoryEntry,
  type Message,
  type SearchResultItem,
} from '@/types/chats.ts';
import { useSettingsStore } from '@/stores/settings.ts';

export async function waitForBackend (maxRetries = 10, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await checkBackendHealth();
      return;
    } catch {
      if (attempt === maxRetries) {
        throw new Error('Backend is not available after maximum retries');
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function checkBackendHealth () {
  const client = await getGraphQLClient();
  const query = `
    query {
      healthCheck
    }
  `;
  await client.request(query);
}

export async function loadChats (): Promise<Chat[]> {
  try {
    const client = await getGraphQLClient();
    const query = gql`
      query GetChats {
        getChats {
          id
          title
          timestamp
          systemPrompt
        }
      }
    `;
    const { getChats } = await client.request<{ getChats: Chat[] }>(query);
    return (getChats || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (error) {
    handleGraphQLError(error);
    return [];
  }
}

export async function loadChatById(chatId: string): Promise<Chat | null> {
  try {
    const client = await getGraphQLClient();
    const query = gql`
      query GetChatById($chatId: String!) {
        getChatById(id: $chatId) {
          id
          title
          timestamp
          systemPrompt
        }
      }
    `;
    const { getChatById } = await client.request<{ getChatById: Chat }>(query, { chatId });
    return getChatById || null;
  } catch (error) {
    handleGraphQLError(error);
    return null;
  }
}

export async function loadChatMessages (chatId: string): Promise<Message[]> {
  try {
    const client = await getGraphQLClient();
    const query = gql`
      query GetChatMessages($chatId: String!) {
        getChatMessages(chatId: $chatId) {
          id
          content
          role
          timestamp
          thinkTime
          isThinking
          attachmentMeta {
            type
            name
            size
            lastModified
          }
          attachmentContent
        }
      }
    `;
    const { getChatMessages } = await client.request<{ getChatMessages: Message[] }>(query, { chatId });
    const messages = getChatMessages || [];
    return messages.map(m => ({
      ...m,
      thinkTime: (m as any).thinkTime ?? undefined,
      isThinking: (m as any).isThinking ?? undefined,
    }));
  } catch (error) {
    handleGraphQLError(error);
    return [];
  }
}

export async function saveChat (chat: Chat): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation SaveChat($chat: ChatInput!) {
        saveChat(chat: $chat) {
          id
        }
      }
    `;
    const serializableChat = {
      id: chat.id,
      title: chat.title,
      timestamp: chat.timestamp,
      messages: chat.messages.map(message => ({
        id: message.id,
        content: message.content,
        role: message.role,
        timestamp: message.timestamp,
        thinkTime: message.thinkTime,
        isThinking: message.isThinking,
        attachmentMeta: message.attachmentMeta
          ? {
            type: message.attachmentMeta.type,
            name: message.attachmentMeta.name,
            size: message.attachmentMeta.size,
            lastModified: message.attachmentMeta.lastModified,
          }
          : null,
        attachmentContent: message.attachmentContent || null,
      })),
    };
    await client.request(mutation, { chat: serializableChat });
  } catch (error) {
    handleGraphQLError(error);
  }
}

export async function saveChatMeta (meta: ChatMeta): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation UpdateChatMeta($meta: ChatMetaInput!) {
        updateChatMeta(meta: $meta) {
          id
        }
      }
    `;
    const serializableMeta = {
      id: meta.id,
      title: meta.title ?? undefined,
      timestamp: meta.timestamp ?? undefined,
      systemPrompt: meta.systemPrompt ?? undefined,
    };
    await client.request(mutation, { meta: serializableMeta });
  } catch (error) {
    handleGraphQLError(error);
  }
}

export async function deleteChat (chatId: string): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation DeleteChat($id: String!) {
        deleteChat(id: $id)
      }
    `;
    await client.request(mutation, { id: chatId });
  } catch (error) {
    handleGraphQLError(error);
  }
}

export async function clearAllChats (): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation {
        clearChats
      }
    `;
    await client.request(mutation);
  } catch (error) {
    handleGraphQLError(error);
  }
}

export async function loadMemory (): Promise<MemoryEntry[]> {
  try {
    const client = await getGraphQLClient();
    const query = gql`
      query {
        getMemory {
          id
          content
          createdAt
          updatedAt
        }
      }
    `;
    const { getMemory } = await client.request<{ getMemory: MemoryEntry[] }>(query);
    return getMemory || [];
  } catch (error) {
    handleGraphQLError(error);
    return [];
  }
}

export async function saveMemory (memory: MemoryEntry[]): Promise<MemoryEntry[]> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation SaveMemoryEntries($entries: [MemoryEntryInput!]!) {
        saveMemoryEntries(entries: $entries) {
          id
          content
          createdAt
          updatedAt
        }
      }
    `;
    const { saveMemoryEntries } = await client.request<{ saveMemoryEntries: MemoryEntry[] }>(mutation, {
      entries: memory.map(entry => ({
        id: entry.id ?? undefined,
        content: entry.content,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    });
    return saveMemoryEntries || [];
  } catch (error) {
    handleGraphQLError(error);
    throw error;
  }
}

export async function deleteMemoryEntry (id: number): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation DeleteMemoryEntry($id: Int!) {
        deleteMemoryEntry(id: $id)
      }
    `;
    await client.request(mutation, { id }, {
      fetchPolicy: 'no-cache',
    });
  } catch (error) {
    handleGraphQLError(error);
    throw error;
  }
}

export async function searchBackend (
  query: string,
  url: string,
  format: 'html' | 'json',
  options?: { searchResultsLimit: number; followSearchLinks: boolean }
): Promise<SearchResultItem[] | null> {
  try {
    const client = await getGraphQLClient();
    const gqlQuery = gql`
      query Search($query: String!, $url: String!, $format: String!, $limit: Int, $followLinks: Boolean) {
        search(query: $query, url: $url, format: $format, limit: $limit, followLinks: $followLinks) {
          results
        }
      }
    `;
    const encodedQuery = encodeURIComponent(query);
    const { search } = await client.request<{ search: { results: string } }>(gqlQuery, {
      query: encodedQuery,
      url,
      format,
      limit: options?.searchResultsLimit,
      followLinks: options?.followSearchLinks,
    });
    return search.results ? JSON.parse(search.results) as SearchResultItem[] : null;
  } catch (error) {
    console.error('searchBackend error:', error);
    handleGraphQLError(error);
    return null;
  }
}

export async function fetchLinkContent (urls: string[]): Promise<LinkContent> {
  try {
    const client = await getGraphQLClient();
    const gqlQuery = gql`
      query FetchLinkContent($urls: [String!]!) {
        fetchLinkContent(urls: $urls) {
          content
          error
        }
      }
    `;
    const encodedUrls = urls.map(url => encodeURIComponent(url));
    const { fetchLinkContent } = await client.request<{ fetchLinkContent: LinkContent }>(gqlQuery, { urls: encodedUrls });
    return fetchLinkContent;
  } catch (error) {
    console.error('fetchLinkContent error:', error);
    handleGraphQLError(error);
    return { content: '', error: 'Failed to fetch link content' };
  }
}

export async function saveMessage (chatId: string, message: Message): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation SaveMessage($chatId: String!, $message: MessageInput!) {
        saveMessage(chatId: $chatId, message: $message) {
          id
        }
      }
    `;
    const serializableMessage = {
      id: message.id,
      content: message.content,
      role: message.role,
      timestamp: message.timestamp,
      thinkTime: message.thinkTime,
      isThinking: message.isThinking,
      attachmentMeta: message.attachmentMeta
        ? {
          type: message.attachmentMeta.type,
          name: message.attachmentMeta.name,
          size: message.attachmentMeta.size,
          lastModified: message.attachmentMeta.lastModified,
        }
        : null,
      attachmentContent: message.attachmentContent || null,
    };
    await client.request(mutation, { chatId, message: serializableMessage });
  } catch (error) {
    handleGraphQLError(error);
  }
}

export async function deleteMessage (chatId: string, messageIds: string[]): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation DeleteMessage($chatId: String!, $messageIds: [String!]!) {
        deleteMessage(chatId: $chatId, messageIds: $messageIds)
      }
    `;
    await client.request(mutation, { chatId, messageIds });
  } catch (error) {
    handleGraphQLError(error);
  }
}

export async function replaceChatMessages (chatId: string, messages: Message[]): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation ReplaceChatMessages($chatId: String!, $messages: [MessageInput!]!) {
        replaceChatMessages(chatId: $chatId, messages: $messages) {
          id
        }
      }
    `;
    const serializableMessages = messages.map(message => ({
      id: message.id,
      content: message.content,
      role: message.role,
      timestamp: message.timestamp,
      thinkTime: message.thinkTime,
      isThinking: message.isThinking,
      attachmentMeta: message.attachmentMeta
        ? {
          type: message.attachmentMeta.type,
          name: message.attachmentMeta.name,
          size: message.attachmentMeta.size,
          lastModified: message.attachmentMeta.lastModified,
        }
        : null,
      attachmentContent: message.attachmentContent || null,
    }));
    await client.request(mutation, { chatId, messages: serializableMessages });
  } catch (error) {
    handleGraphQLError(error);
  }
}

export async function uploadRagFiles (
  files: File[],
  ollamaURL: string,
  embeddingsModel: string,
): Promise<string[]> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation UploadRagFiles($files: [Upload!]!, $ollamaURL: String!, $embeddingsModel: String!) {
        uploadRagFiles(files: $files, ollamaURL: $ollamaURL, embeddingsModel: $embeddingsModel)
      }
    `;
    const { settings } = useSettingsStore();
    const formData = new FormData();
    formData.append(
      'operations',
      JSON.stringify({
        query: mutation.loc!.source.body,
        variables: { files: files.map(() => null), ollamaURL, embeddingsModel },
        operationName: 'UploadRagFiles',
      })
    );
    formData.append('map', JSON.stringify(Object.fromEntries(files.map((_, i) => [`${i}`, [`variables.files.${i}`]]))));
    files.forEach((file, i) => formData.append(`${i}`, file, file.name));
    const response = await fetch(`${settings.backendURL}/graphql`, {
      method: 'POST',
      body: formData,
      headers: {
        'x-apollo-operation-name': 'UploadRagFiles',
        'Accept': 'application/json',
      },
    });
    const { data, errors } = await response.json();
    if (errors) {
      throw new Error(errors[0].message);
    }
    return data.uploadRagFiles || [];
  } catch (error) {
    handleGraphQLError(error);
    throw error;
  }
}

export async function getRagFiles (): Promise<string[]> {
  try {
    const client = await getGraphQLClient();
    const query = gql`
      query {
        getRagFiles
      }
    `;
    const { getRagFiles } = await client.request<{ getRagFiles: string[] }>(query);
    return getRagFiles || [];
  } catch (error) {
    handleGraphQLError(error);
    return [];
  }
}

export async function deleteRagFile (filename: string): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation DeleteRagFile($filename: String!) {
        deleteRagFile(filename: $filename)
      }
    `;
    await client.request(mutation, { filename });
  } catch (error) {
    handleGraphQLError(error);
    throw error;
  }
}

export async function getEmbeddings (filename: string): Promise<number[]> {
  try {
    const client = await getGraphQLClient();
    const query = gql`
      query GetEmbeddings($filename: String!) {
        getEmbeddings(filename: $filename)
      }
    `;
    const { getEmbeddings } = await client.request<{ getEmbeddings: number[] }>(query, { filename });
    return getEmbeddings || [];
  } catch (error) {
    handleGraphQLError(error);
    return [];
  }
}

export async function searchRagFiles (
  query: string,
  filenames: string[],
  ollamaURL: string,
  embeddingsModel: string,
  limit: number = 3
): Promise<{ filename: string; text: string; similarity: number }[]> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      query SearchRagFiles($query: String!, $filenames: [String!]!, $ollamaURL: String!, $embeddingsModel: String!, $limit: Int!) {
        searchRagFiles(query: $query, filenames: $filenames, ollamaURL: $ollamaURL, embeddingsModel: $embeddingsModel, limit: $limit) {
          filename
          text
          similarity
        }
      }
    `;
    const { settings } = useSettingsStore();
    const { searchRagFiles } = await client.request<{
      searchRagFiles: { filename: string; text: string; similarity: number }[];
    }>(mutation, {
      query,
      filenames,
      ollamaURL,
      embeddingsModel,
      limit,
    });
    return searchRagFiles || [];
  } catch (error) {
    handleGraphQLError(error);
    return [];
  }
}
