import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { ChatEntity } from './chat.entity';

@Entity()
export class MessageEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  content: string;

  @Column()
  role: 'user' | 'assistant';

  @Column({ nullable: true })
  timestamp: number;

  @Column({ type: 'json', nullable: true })
  attachmentMeta?: {
    type: 'TEXT' | 'IMAGE';
    name: string;
    size: number;
    lastModified: number;
  };

  @Column({ type: 'text', nullable: true })
  attachmentContent?: string;

  @Column({ type: 'float', nullable: true })
  thinkTime?: number;

  @Column({ type: 'boolean', nullable: true })
  isThinking?: boolean;

  @ManyToOne(() => ChatEntity, (chat) => chat.messages, {
    onDelete: 'CASCADE',
  })
  chat: ChatEntity;
}
