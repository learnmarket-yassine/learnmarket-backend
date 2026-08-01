import { forwardRef, Inject } from '@nestjs/common';
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
import { SessionsService } from '../services/sessions.service';

function setSocketUser(client: Socket, user: AuthUser): void {
  (client.data as { user: AuthUser }).user = user;
}
function getSocketUser(client: Socket): AuthUser {
  return (client.data as { user: AuthUser }).user;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  namespace: '/sessions',
})
export class SessionsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService,
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

  @SubscribeMessage('session:join')
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    await this.sessionsService.assertParticipant(
      getSocketUser(client).id,
      data.sessionId,
    );
    await client.join(`session:${data.sessionId}`);
  }

  @SubscribeMessage('session:leave')
  async handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    await client.leave(`session:${data.sessionId}`);
  }

  emitParticipantJoined(sessionId: string, role: 'TUTOR' | 'LEARNER'): void {
    this.server.to(`session:${sessionId}`).emit('session:participant_joined', {
      sessionId,
      role,
      joinedAt: new Date().toISOString(),
    });
  }
}
