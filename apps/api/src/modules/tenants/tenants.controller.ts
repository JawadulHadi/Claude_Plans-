import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantsService } from './tenants.service.js';

@ApiTags('tenants')
@Controller('agency/:agencyUserId')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('members')
  @ApiOperation({ summary: 'List all agency member profiles' })
  listMembers(@Param('agencyUserId') agencyUserId: string) {
    return this.tenants.listMembers(agencyUserId);
  }

  @Post('members')
  @ApiOperation({ summary: 'Add a user to the agency roster (by email)' })
  addMember(
    @Param('agencyUserId') agencyUserId: string,
    @Body() body: { email: string; label?: string },
  ) {
    return this.tenants.addMember(agencyUserId, body.email, body.label);
  }

  @Patch('members/:memberId')
  @ApiOperation({ summary: 'Update member label or active state' })
  updateMember(
    @Param('agencyUserId') agencyUserId: string,
    @Param('memberId') memberId: string,
    @Body() body: { label?: string; is_active?: boolean },
  ) {
    return this.tenants.updateMember(agencyUserId, memberId, body.label, body.is_active);
  }

  @Delete('members/:memberId')
  @ApiOperation({ summary: 'Remove (deactivate) a member from the agency' })
  removeMember(
    @Param('agencyUserId') agencyUserId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.tenants.removeMember(agencyUserId, memberId);
  }

  @Get('bulk-apply-status')
  @ApiOperation({ summary: 'Application funnel stats for all agency members' })
  bulkApplyStatus(@Param('agencyUserId') agencyUserId: string) {
    return this.tenants.getBulkApplyStatus(agencyUserId);
  }
}
