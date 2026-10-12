import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JobsService } from './jobs.service.js';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('matched/:userId')
  @ApiOperation({ summary: 'Get semantically matched jobs for a user' })
  async getMatched(
    @Param('userId') userId: string,
    @Query('limit') limit = '20',
  ) {
    return this.jobsService.getMatchedJobs(userId, Number(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single job listing' })
  async getJob(@Param('id') id: string) {
    return this.jobsService.getJobById(id);
  }
}
