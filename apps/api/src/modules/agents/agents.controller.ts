import { Controller, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AgentsService } from './agents.service.js';

@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post('pipeline/:userId/:resumeId')
  @ApiOperation({ summary: 'Trigger full parallel agent pipeline for a user' })
  async triggerPipeline(
    @Param('userId') userId: string,
    @Param('resumeId') resumeId: string,
  ) {
    return this.agentsService.triggerFullPipeline(userId, resumeId);
  }
}
