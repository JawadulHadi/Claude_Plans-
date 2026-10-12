import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PipelineService } from './pipeline.service.js';

@ApiTags('pipeline')
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get all applications for a user' })
  async getApplications(@Param('userId') userId: string) {
    return this.pipelineService.getApplicationsByUser(userId);
  }

  @Get(':userId/summary')
  @ApiOperation({ summary: 'Pipeline funnel summary (counts by status)' })
  async getSummary(@Param('userId') userId: string) {
    return this.pipelineService.getPipelineSummary(userId);
  }

  @Patch('application/:id/status')
  @ApiOperation({ summary: 'Update application status' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('source') source = 'user',
  ) {
    return this.pipelineService.updateStatus(id, status as any, source);
  }
}
