import { ConflictException, forwardRef, Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../../auth/auth.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MessagingService } from '../services/messaging.service';

function setSocketUser(client: Socket, user: AuthUser): void {
  (client.data as { user: AuthUser }).user = user;
}
function getSocketUser(client: Socket): AuthUser {
  return (client.data as { user: AuthUser }).user;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  namespace: '/messaging',
})
export class MessagingGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    @Inject(forwardRef(() => MessagingService))
    private readonly messagingService: MessagingService,
    private readonly authService: AuthService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      const user = this.authService.verifyAccessToken(token ?? '');
      setSocketUser(client, user);
      await client.join(`user:${user.id}`);
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    await this.messagingService.assertParticipant(
      getSocketUser(client).id,
      data.conversationId,
    );
    await client.join(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    await client.leave(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string },
  ) {
    try {
      const message = await this.messagingService.sendMessage(
        getSocketUser(client).id,
        data.conversationId,
        data.content,
      );
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('message:new', message);
      return message; // acknowledgment for optimistic-UI reconciliation
    } catch (err) {
      if (err instanceof ConflictException) {
        return { error: 'CONVERSATION_INACTIVE', message: err.message };
      }
      throw err;
    }
  }

  @SubscribeMessage('message:read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = getSocketUser(client).id;
    await this.messagingService.markRead(userId, data.conversationId);
    const payload = { conversationId: data.conversationId, readBy: userId };
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('message:read', payload);
    return payload;
  }

  emitConversationStatusChanged(
    conversationId: string,
    tutorId: string,
    learnerId: string,
    isActive: boolean,
  ): void {
    this.server
      .to(`user:${tutorId}`)
      .to(`user:${learnerId}`)
      .emit('conversation:status_changed', { conversationId, isActive });
  }
}
