import test from "node:test";
import assert from "node:assert/strict";

import { formatCourses, toCourse, type Course } from "./listar-cursos.ts";

test("the wire shape is translated into a domain course", () => {
  const course = toCourse({
    id_curso: 130,
    Curso: "ADMINISTRACIÓN AGROPECUARIA",
    Organizacion: "INSTITUTO TERRA",
  });

  assert.deepEqual(course, {
    id: 130,
    name: "Administración agropecuaria",
    organization: "Instituto Terra",
  });
});

test("course titles use Spanish sentence case, not English title case", () => {
  const course = toCourse({
    id_curso: 101,
    Curso: "ELABORACIÓN DE CERVEZA ARTESANAL",
    Organizacion: "FUNDACIÓN SABERES",
  });

  // "Elaboración De Cerveza Artesanal" would capitalize the preposition, which
  // is an English convention and reads as a translation artifact in Spanish.
  assert.equal(course.name, "Elaboración de cerveza artesanal");
  assert.equal(course.organization, "Fundación Saberes");
});

test("conjunctions and prepositions stay lowercase inside a title", () => {
  const course = toCourse({
    id_curso: 191,
    Curso: "PERITO CLASIFICADOR DE CEREALES, OLEAGINOSAS Y LEGUMBRES",
    Organizacion: "INSTITUTO TERRA",
  });

  assert.equal(
    course.name,
    "Perito clasificador de cereales, oleaginosas y legumbres",
  );
});

test("courses are grouped by organization with a total", () => {
  const courses: Course[] = [
    { id: 61, name: "Apicultura", organization: "Instituto Terra" },
    { id: 86, name: "Auxiliar en farmacia", organization: "Fundación Saberes" },
    { id: 130, name: "Administración agropecuaria", organization: "Instituto Terra" },
  ];

  const text = formatCourses(courses);

  assert.match(text, /Hay 3 cursos disponibles/);
  assert.match(text, /\*\*Instituto Terra\*\*/);
  assert.match(text, /\*\*Fundación Saberes\*\*/);
  assert.match(text, /- Apicultura \(id 61\)/);
  // Each organization must appear once, with its courses underneath.
  assert.equal(text.match(/\*\*Instituto Terra\*\*/g)?.length, 1);
});

test("an empty catalogue is stated plainly, not as an error", () => {
  assert.equal(
    formatCourses([]),
    "No hay cursos disponibles en este momento.",
  );
});

test("a single course is described in the singular", () => {
  const text = formatCourses([
    { id: 61, name: "Apicultura", organization: "Instituto Terra" },
  ]);

  assert.match(text, /Hay 1 curso disponible:/);
});
