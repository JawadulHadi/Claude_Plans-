import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SessionsService } from './sessions.service.js';
import type { InterviewSession } from '@pitchfire/shared';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'List interview sessions for a user' })
  list(@Param('userId') userId: string): Promise<InterviewSession[]> {
    return this.sessions.getByUser(userId);
  }

  @Get('detail/:id')
  @ApiOperation({ summary: 'Get a single interview session' })
  getOne(@Param('id') id: string): Promise<InterviewSession> {
    return this.sessions.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update outcome, prep notes, or status for a session' })
  update(
    @Param('id') id: string,
    @Body() patch: Partial<InterviewSession>,
  ): Promise<InterviewSession> {
    return this.sessions.update(id, patch);
  }
}
