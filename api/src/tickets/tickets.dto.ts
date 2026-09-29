import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Category, Priority, TicketStatus } from '../common/enums';
import { PageQuery } from '../common/pagination';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  description: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(Category)
  category?: Category;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  /** A user id to assign, or null to unassign. */
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  body: string;

  /** Staff only; ignored (forced to false) for customers. */
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

const toBool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

export class ListTicketsQuery extends PageQuery {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  /** Only tickets assigned to me (staff). */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  unassigned?: boolean;

  /** Only tickets past their first-response or resolution deadline. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  overdue?: boolean;

  /** Free-text search over subject and description. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'resolveDueAt'])
  sortBy: 'createdAt' | 'updatedAt' | 'resolveDueAt' = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC' = 'DESC';
}
