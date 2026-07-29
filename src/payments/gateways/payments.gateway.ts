import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../../auth/auth.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

function setSocketUser(client: Socket, user: AuthUser): void {
  (client.data as { user: AuthUser }).user = user;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  namespace: '/payments',
})
export class PaymentsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(private readonly authService: AuthService) {}

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

  /** The learner's "finalizing your booking" waiting screen listens for this. */
  emitProposalAccepted(learnerId: string, proposalId: string): void {
    this.server
      .to(`user:${learnerId}`)
      .emit('proposal:accepted', { proposalId });
  }
}
