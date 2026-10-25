import { Body, Controller, HttpCode, Module, Post, UseGuards } from '@nestjs/common';
import { KafkaModule } from '../kafka/kafka.service';
import { SignatureGuard } from './webhook.guard';
import { N8nWebhookDto } from './webhook.dto';
import { WebhookResult, WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhook: WebhookService) {}

  /** Appelé par les nœuds « HTTP Request » du workflow n8n (voir docs/n8n-integration.md). 202 : accepté, traité en asynchrone. */
  @Post('n8n')
  @HttpCode(202)
  @UseGuards(SignatureGuard)
  receive(@Body() dto: N8nWebhookDto): Promise<WebhookResult> {
    return this.webhook.handle(dto);
  }
}

@Module({
  imports: [KafkaModule],
  controllers: [WebhookController],
  providers: [WebhookService, SignatureGuard],
})
export class WebhookModule {}
