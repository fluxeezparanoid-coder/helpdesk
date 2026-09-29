import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { Role } from '../common/enums';
import { PageQuery } from '../common/pagination';
import { AuditService } from './audit.service';

class AuditQuery extends PageQuery {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Roles(Role.Admin)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Security and activity log: logins, lockouts, role changes, ticket updates (admin)' })
  list(@Query() q: AuditQuery) {
    return this.audit.list(q.page, q.pageSize, q.action);
  }
}
