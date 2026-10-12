import {
  Controller, Post, Get, Param, Body, UploadedFile,
  UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { ResumeService } from './resume.service.js';

@ApiTags('resume')
@Controller('resume')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload and parse a resume PDF or plain text' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5_000_000 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('user_id') userId: string,
  ) {
    if (!file && !userId) throw new BadRequestException('file and user_id required');
    return this.resumeService.ingestResume(userId, file.buffer, file.originalname);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get resume by ID' })
  async getResume(@Param('id') id: string) {
    return this.resumeService.getResume(id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get active resume for a user' })
  async getActiveResume(@Param('userId') userId: string) {
    return this.resumeService.getActiveResume(userId);
  }

  @Post(':id/score-jobs')
  @ApiOperation({ summary: 'Trigger job scoring for a resume — enqueues scout + score agents' })
  async scoreJobs(
    @Param('id') resumeId: string,
    @Body('user_id') userId: string,
  ) {
    return this.resumeService.triggerJobScoring(userId, resumeId);
  }
}
