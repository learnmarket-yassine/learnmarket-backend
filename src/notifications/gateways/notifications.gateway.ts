import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Notification } from '@prisma/client';
import { AuthService } from '../../auth/auth.service';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(private readonly authService: AuthService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      const user = this.authService.verifyAccessToken(token ?? '');
      await client.join(`user:${user.id}`);
    } catch {
      client.disconnect();
    }
  }

  emitToUser(userId: string, notification: Notification): void {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
