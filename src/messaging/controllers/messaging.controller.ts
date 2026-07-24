import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { GetMessagesQueryDto } from '../dto/get-messages-query.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { MessagingService } from '../services/messaging.service';

@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.messaging.listConversations(userId);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messaging.findOrCreateConversation(userId, dto.counterpartId);
  }

  @Get(':id/messages')
  getMessages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.messaging.getMessages(userId, id, query.page, query.take);
  }

  @Post(':id/messages')
  sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    // REST fallback if the socket isn't connected -- delegates to the
    // exact same service method the gateway uses. Does NOT emit a socket
    // broadcast itself -- if used, the recipient sees the message on
    // next fetch/reconnect, not instantly. Acceptable degradation for a
    // fallback path.
    return this.messaging.sendMessage(userId, id, dto.content);
  }

  @Post(':id/read')
  markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.messaging.markRead(userId, id);
  }
}
