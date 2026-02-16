import { getGraphQLClient, handleGraphQLError } from '@/utils/graphql';
import { gql } from 'graphql-tag';
import { type ISettings } from '../types/settings.ts';

export async function loadSettings(): Promise<ISettings | null> {
  try {
    const client = await getGraphQLClient();
    const query = gql`
      query GetSettings {
        getSettings {
          isAsideOpen
          backendURL
          ollamaURL
          selectedModel
          defaultModel
          memoryModel
          searchModel
          searxngURL
          searchFormat
          defaultChatTitle
          theme
          isSearchAsDefault
          chatScrollMode
          showToolbarLabels
          showSendButton
          systemPrompts {
            title
            content
          }
          defaultSystemPrompt {
            title
            content
          }
          systemModel
          titlePrompt
          memoryPrompt
          searchPrompt
          ragPrompt
          searchResultsLimit
          followSearchLinks
          maxMessages
          embeddingsModel
          ragFiles
          selectedRagFiles
        }
      }
    `;
    const { getSettings } = await client.request<{ getSettings: ISettings }>(query);
    return getSettings || null;
  } catch (error) {
    console.error('Failed to load settings:', error);
    handleGraphQLError(error);
    return null;
  }
}

export async function saveSettings(settings: ISettings): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation SaveSettings($entries: SettingsInput!) {
        saveSettings(entries: $entries) {
          backendURL
        }
      }
    `;
    await client.request(mutation, { entries: settings });
  } catch (error) {
    console.error('Failed to save settings:', error);
    handleGraphQLError(error);
  }
}

export async function resetSettings(): Promise<void> {
  try {
    const client = await getGraphQLClient();
    const mutation = gql`
      mutation {
        resetSettings
      }
    `;
    await client.request(mutation);
  } catch (error) {
    console.error('Failed to reset settings:', error);
    handleGraphQLError(error);
  }
}
