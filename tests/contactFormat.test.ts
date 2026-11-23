
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, profileSchema, customerSchema } from "../shared/people";
test("Teléfonos: móvil, fijo Santiago, prefijo país, edición incremental y formato estable",()=>{
 for(const value of ["945670987","56945670987","+56 9 4567 0987","0056945670987"]) assert.equal(formatPhone(value),"+56 9 4567 0987");
 for(const value of ["223456789","56223456789","+56 2 2345 6789"]) assert.equal(formatPhone(value),"+56 2 2345 6789");
 assert.equal(formatPhone("9"),"+56 9");assert.equal(formatPhone("94"),"+56 9 4");
 assert.equal(formatPhone(""),"");assert.equal(formatPhone("+56"),"+56");
 assert.equal(formatPhone("+1 202 555 0100"),"+1 202 555 0100");
 assert.equal(formatPhone("945670987123"),"945670987123");
});
test("Contactos: normalización al guardar y cuentas anteriores sin RUT",()=>{
 const input={name:"Usuario Prueba",email:"test@example.com",phone:"223456789",position:"Ventas"};
 const result=profileSchema.parse({...input,rut:"123456785"});
 assert.equal(result.rut,"12.345.678-5");assert.equal(result.phone,"+56 2 2345 6789");
 assert.ok(profileSchema.safeParse(input).success);
 assert.ok(!profileSchema.safeParse({...input,rut:"123456784"}).success);
 assert.equal(customerSchema.parse({name:"Empresa",rut:"",address:"",email:"",phone:"945670987"}).phone,"+56 9 4567 0987");
});
