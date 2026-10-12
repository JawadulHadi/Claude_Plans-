import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApplyService } from './apply.service.js';

@ApiTags('apply')
@Controller('apply')
export class ApplyController {
  constructor(private readonly applyService: ApplyService) {}

  @Get('pending/:userId')
  @ApiOperation({ summary: 'Get applications pending user review' })
  getPending(@Param('userId') userId: string) {
    return this.applyService.getPendingReview(userId);
  }

  @Post(':applicationId')
  @ApiOperation({ summary: 'Approve or withdraw an application' })
  decide(
    @Param('applicationId') applicationId: string,
    @Body() body: { action: 'approve' | 'withdraw' },
  ) {
    return this.applyService.handleDecision(applicationId, body.action);
  }
}
