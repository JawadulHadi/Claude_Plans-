import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get analytics dashboard for user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  async getDashboard(@Param('userId') userId: string) {
    return this.analyticsService.getDashboard(userId);
  }
}
