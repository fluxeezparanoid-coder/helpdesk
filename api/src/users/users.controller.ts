import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { Role } from '../common/enums';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.Admin)
  @Get()
  @ApiOperation({ summary: 'List users (admin)' })
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Roles(Role.Agent, Role.Admin)
  @Get('staff')
  @ApiOperation({ summary: 'Assignable staff members (agent, admin)' })
  staff() {
    return this.users.staff();
  }

  @Roles(Role.Admin)
  @Post()
  @ApiOperation({ summary: 'Create a user with any role (admin)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Roles(Role.Admin)
  @Patch(':id')
  @ApiOperation({ summary: 'Change role or deactivate (admin). Deactivating revokes all sessions.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }
}
